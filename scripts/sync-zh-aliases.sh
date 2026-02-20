#!/usr/bin/env bash
# Sundeep Mediratta (c) 2026
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Keep Chinese alias PO files in sync with canonical script variants:
#   zh-Hans -> zh_CN
#   zh-Hant -> zh_TW

set -euo pipefail

ROOT_DIR="${MESON_SOURCE_ROOT:-$(pwd)}"
PO_DIR="${ROOT_DIR}/po"

sync_pair() {
  local src_lang="$1"
  local dst_lang="$2"
  local src_file="${PO_DIR}/${src_lang}.po"
  local dst_file="${PO_DIR}/${dst_lang}.po"
  local tmp_file

  if [[ ! -f "${src_file}" ]]; then
    echo "[${src_lang}] Skipping: ${src_file} not found"
    return 0
  fi

  tmp_file="$(mktemp)"
  cp "${src_file}" "${tmp_file}"

  awk -v lang="${dst_lang}" '
    BEGIN { replaced = 0 }
    /^"Language: .*\\n"$/ && !replaced {
      print "\"Language: " lang "\\n\""
      replaced = 1
      next
    }
    { print }
  ' "${tmp_file}" > "${tmp_file}.new"

  mv "${tmp_file}.new" "${tmp_file}"

  if [[ -f "${dst_file}" ]] && cmp -s "${tmp_file}" "${dst_file}"; then
    rm -f "${tmp_file}"
    echo "[${src_lang} -> ${dst_lang}] no changes"
    return 0
  fi

  mv "${tmp_file}" "${dst_file}"
  echo "[${src_lang} -> ${dst_lang}] updated"
}

sync_pair "zh-Hans" "zh_CN"
sync_pair "zh-Hant" "zh_TW"
