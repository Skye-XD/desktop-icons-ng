#!/usr/bin/env bash
# Normalize .po files to Weblate-style wrapping (width=77)
# Sundeep Mediratta (c) 2025
# SPDX-License-Identifier: GPL-3.0-or-later

# Script to automate updating all po files

set -euo pipefail

# ---- Config (override via env if needed) ----
LT_URL="${LT_URL:-http://127.0.0.1:5000}"
LT_CONTAINER_NAME="${LT_CONTAINER_NAME:-focused_hellman}"
START_TIMEOUT="${START_TIMEOUT:-120}"

DOCKER="${DOCKER_BIN:-sudo docker}"
RUN_SH="${RUN_SH:-sudo subprojects/libretranslate/run.sh}"  # submodule launcher

# ---- Helpers ----

LT_BG_PID=""
OWNED_CID=""
CLEANED=0

cleanup() {
  (( CLEANED )) && return; CLEANED=1
  echo "Cleaning up LibreTranslate..."

  if [[ -n "${LT_BG_PID:-}" ]] && kill -0 "$LT_BG_PID" 2>/dev/null; then
    echo "  - SIGINT to launcher (PID $LT_BG_PID)"
    kill -INT "$LT_BG_PID" 2>/dev/null || true
    sleep 3
    wait "$LT_BG_PID" 2>/dev/null || true
  fi

  if [[ -n "${OWNED_CID:-}" ]]; then
    if [[ -n "$($DOCKER ps -q -f id="$OWNED_CID")" ]]; then
      echo "  - SIGINT to container $OWNED_CID"
      $DOCKER kill --signal=INT "$OWNED_CID" >/dev/null 2>&1 || true

      for _ in 1 2 3; do
        sleep 1
        [[ -z "$($DOCKER ps -q -f id="$OWNED_CID")" ]] && { echo "  - Container exited after SIGINT"; return; }
      done

      echo "  - docker stop (3s grace) $OWNED_CID"
      $DOCKER stop -t 3 "$OWNED_CID" >/dev/null 2>&1 || true

      if [[ -n "$($DOCKER ps -q -f id="$OWNED_CID")" ]]; then
        echo "  - Force killing $OWNED_CID"
        $DOCKER kill "$OWNED_CID" >/dev/null 2>&1 || true
      fi
    fi
  fi
}

trap 'exit 130' INT
trap cleanup EXIT

wait_for_lt() {
  local deadline=$((SECONDS + START_TIMEOUT))
  while (( SECONDS < deadline )); do
    if curl -fsS "${LT_URL}/languages" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

ensure_lt_running() {
  if $DOCKER ps --format '{{.Image}}' | grep -q 'libretranslate'; then
    echo "LibreTranslate already running."
    return 0
  fi

  if $DOCKER ps -a --format '{{.ID}}\t{{.Image}}' | grep -q 'libretranslate'; then
    cid=$($DOCKER ps -a --format '{{.ID}}\t{{.Image}}' | grep 'libretranslate' | awk '{print $1}' | head -n1)
    echo "Starting existing container $cid..."
    $DOCKER start "$cid" >/dev/null
    return 0
  fi

  echo "Launching LibreTranslate via submodule with a PTY: $RUN_SH"
  script -qf /dev/null -c "$RUN_SH" &
  LT_BG_PID=$!

  echo -n "Waiting for LibreTranslate at ${LT_URL} ..."
  if ! wait_for_lt; then
    echo
      echo "ERROR: LibreTranslate did not become ready within ${START_TIMEOUT}s (${LT_URL})" >&2
    echo "killing background launcher..." >&2
    exit 1
  fi
  if [[ -n "${LT_BG_PID:-}" ]]; then
    OWNED_CID="$($DOCKER ps -q --filter ancestor=libretranslate/libretranslate --latest || true)"
    echo "\nLaunched container $OWNED_CID..."
  fi
  echo " ready."
}


ensure_lt_running

# Export LT_* for the Node autofill script
export LT_URL
export LT_SOURCE="${LT_SOURCE:-en}"
export LT_API_KEY="${LT_API_KEY:-}"

# --- Main ---

meson setup build --reconfigure
ninja -C build gtk4-ding-pot
ninja -C build gtk4-ding-update-po
ninja -C build po-autofill

