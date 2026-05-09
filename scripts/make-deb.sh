#!/usr/bin/env bash
set -euo pipefail

# ---- configurable ----
BUILD_DIR="${BUILD_DIR:-build}"
PREFIX="${PREFIX:-/usr}"
PKG_NAME="${PKG_NAME:-gnome-shell-extension-adw-desktop-icons}"
VERSION="${VERSION:-100.23}"
MAINTAINER="${MAINTAINER:-Sundeep Mediratta <smedius@gmail.com>}"
SECTION="${SECTION:-gnome}"
PRIORITY="${PRIORITY:-optional}"
DESCRIPTION="${DESCRIPTION:-Adw/Gtk4 Fork of Desktop Icons NG Extension that displays icons on the Desktop in Gnome}"
LICENSE="${LICENSE:-GPL-3+}"
DEPENDS="${DEPENDS:-gir1.2-gnomeautoar-0.1,
         gir1.2-gnomedesktop-3.0,
         gnome-shell (>= 49~),
         gnome-shell (<< 51~),
         gjs,
         nautilus (>= 3.38)}"
HOMEPAGE="https://gitlab.com/smedius/desktop-icons-ng"
ARCH="all"
STAMP="$(date -u +%Y%m%d%H%M)"
WORKDIR="$(pwd)/debian"
ROOT="$WORKDIR/${PKG_NAME}_${VERSION}_${ARCH}"
DESTDIR="$ROOT"
DIST_DIR="${DIST_DIR:-$PWD/dist}"

rm -rf "$WORKDIR"
mkdir -p "$DESTDIR" "$ROOT/DEBIAN"
mkdir -p "$DIST_DIR"

# Configure/Build
if [ ! -d "$BUILD_DIR" ]; then
  meson setup "$BUILD_DIR" --prefix="$PREFIX" --buildtype=release
fi
meson compile -C "$BUILD_DIR"

# Stage install
meson install -C "$BUILD_DIR" --destdir "$DESTDIR"

{
  echo "Package: $PKG_NAME"
  echo "Version: $VERSION"
  echo "Section: $SECTION"
  echo "Priority: $PRIORITY"
  echo "Architecture: $ARCH"
  echo "Maintainer: $MAINTAINER"
  [ -n "$DEPENDS" ] && echo "Depends: $DEPENDS"
  echo "License: $LICENSE"
  echo "Homepage: $HOMEPAGE"
  echo "Description: $DESCRIPTION"
} > "$ROOT/DEBIAN/control"

 cat >"$ROOT/DEBIAN/postinst" <<'EOS'
#!/bin/bash

echo 'Checking apparmor status..'

if systemctl status apparmor > /dev/null ; then
    echo 'Reloading apparmor rules...';
    systemctl restart apparmor;
else
    echo 'Apparmor not running, skipping'
fi
EOS

find "$ROOT" -type d -exec chmod 0755 {} +
find "$ROOT/DEBIAN" -type f -exec chmod 0755 {} +
find "$DESTDIR$PREFIX" -type f ! -name "adw-ding.js" -exec chmod 0644 {} +
find "$DESTDIR$PREFIX" -type f -name "adw-ding.js" -exec chmod 0774 {} +

# Build .deb
package="${PKG_NAME}_${VERSION}-${STAMP}_${ARCH}.deb"
OUT="$DIST_DIR/$package"
dpkg-deb --build --root-owner-group "$ROOT" "$OUT"
echo "Built: $OUT"
