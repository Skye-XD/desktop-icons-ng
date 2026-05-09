#!/usr/bin/env bash
set -euo pipefail

RAW_VERSION="${VERSION:-100.23}"
VERSION="$(printf '%s' "$RAW_VERSION" | sed -E 's|^refs/tags/||; s|^[Gg]tk4-||')"
COMMIT_SHA="${COMMIT_SHA:-$(git rev-parse HEAD)}"
DIST_DIR="${DIST_DIR:-$PWD/dist}"

if [ -z "$VERSION" ]; then
  echo "Could not derive package VERSION from input: $RAW_VERSION" >&2
  exit 1
fi

mkdir -p "$DIST_DIR"
find "$DIST_DIR" -maxdepth 1 -type f -delete

export VERSION COMMIT_SHA DIST_DIR

"$PWD/scripts/make-rpm.sh"
"$PWD/scripts/make-deb.sh"
"$PWD/scripts/make-arch.sh"
"$PWD/scripts/export-zip.sh"
