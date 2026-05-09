#!/usr/bin/env bash

# Export extension as zip file for extensions.gnome.org
# ----------------------------------------------------
#
# Usage:
# ./export-zip.sh - builds extension & create zip inside repository

set -euo pipefail

REPO_DIR="$(pwd)"
BUILD_DIR="${REPO_DIR}/builddir"
UUID="gtk4-ding@smedius.gitlab.com"
LOCAL_PREFIX="${REPO_DIR}/${UUID}"
EXTENSIONS_DIR="${LOCAL_PREFIX}/share/gnome-shell/extensions/${UUID}"
SCHEMADIR="${LOCAL_PREFIX}/share/glib-2.0/schemas"
DIST_DIR="${DIST_DIR:-$REPO_DIR/dist}"

mkdir -p "${DIST_DIR}"

# Check old builddir
if [ -d "${BUILD_DIR}" ]; then
  rm -rf "${BUILD_DIR}"
fi

# Meson build
echo "# -------------------"
echo "# Buiding with meson"
echo "# -------------------"

meson setup --prefix="${LOCAL_PREFIX}" --localedir=locale "${BUILD_DIR}" "${REPO_DIR}"
ninja -C "${BUILD_DIR}" install

# Create distribution ZIP file
echo -e "\\n# --------------------------"
echo "# Create extension ZIP file"
echo "# --------------------------"
rm -rf "${REPO_DIR}/${UUID}.zip" "${LOCAL_PREFIX}/${UUID}.zip"
cd "${LOCAL_PREFIX}" || exit
cp -r "${SCHEMADIR}" .
rm -f "./schemas/gschemas.compiled"
cp -r "${EXTENSIONS_DIR}"/* .
zip -qr "${UUID}.zip" ./*.js ./*.json ./locale ./schemas ./app ./utils ./dependencies
mv -f "${UUID}.zip" "${DIST_DIR}/"
cd "${REPO_DIR}" || exit

# Clean
rm -rf "${BUILD_DIR}" "${LOCAL_PREFIX}"
