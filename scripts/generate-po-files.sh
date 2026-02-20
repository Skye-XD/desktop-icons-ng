#!/usr/bin/env bash
# Generate and merge PO files, then sync zh aliases.

set -euo pipefail

if [[ ! -f build/build.ninja ]]; then
  meson setup build
fi

ninja -C build gtk4-ding-pot
ninja -C build gtk4-ding-update-po
bash scripts/sync-zh-aliases.sh
