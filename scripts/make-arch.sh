#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-100.23}"
COMMIT_SHA="${COMMIT_SHA:-$(git rev-parse HEAD)}"
OUT_DIR="${OUT_DIR:-$PWD/archlinux}"
MAKEPKG_FLAGS="${MAKEPKG_FLAGS:---force --cleanbuild --nodeps --nosign}"
REPO_ROOT="${REPO_ROOT:-$(git rev-parse --show-toplevel)}"
DIST_DIR="${DIST_DIR:-$PWD/dist}"
DEFAULT_AUR_REPO_DIR="$PWD/../gnome-shell-extension-gtk4-desktop-icons-ng"
AUR_REPO_DIR="${AUR_REPO_DIR:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUR_TEMPLATE="${AUR_TEMPLATE:-$SCRIPT_DIR/PKGBUILD.archlinux.template}"

tag_version="${VERSION#refs/tags/}"
pkgver="$(printf '%s' "$tag_version" | sed -E 's/^[Gg]tk4-//')"

if [ -z "$pkgver" ]; then
  echo "Could not derive pkgver from VERSION=$VERSION" >&2
  exit 1
fi

pkgname="gnome-shell-extension-gtk4-desktop-icons-ng"
pkgrel="${PKGREL:-1}"
pkgdesc="${PKGDESC:-GTK4 desktop icons extension fork for GNOME Shell 49, 50, with Desktop Widget support}"
pkgurl="${PKGURL:-https://extensions.gnome.org/extension/5263/gtk4-desktop-icons-ng-ding}"
source_repo="${SOURCE_REPO:-https://gitlab.com/smedius/desktop-icons-ng.git}"
build_source_repo="${BUILD_SOURCE_REPO:-$source_repo}"
if [ "$build_source_repo" = "$source_repo" ] && [ -d "$REPO_ROOT/.git" ]; then
  build_source_repo="file://$REPO_ROOT"
fi

if [ -z "$AUR_REPO_DIR" ] && [ -d "$DEFAULT_AUR_REPO_DIR" ] && [ -w "$DEFAULT_AUR_REPO_DIR" ]; then
  AUR_REPO_DIR="$DEFAULT_AUR_REPO_DIR"
fi

mkdir -p "$OUT_DIR"
mkdir -p "$DIST_DIR"

if [ ! -f "$AUR_TEMPLATE" ]; then
  echo "Arch PKGBUILD template not found: $AUR_TEMPLATE" >&2
  exit 1
fi

template_file="$OUT_DIR/PKGBUILD.template"
cp -f "$AUR_TEMPLATE" "$template_file"

ARCH_PKGVER="$pkgver" ARCH_COMMIT_SHA="$COMMIT_SHA" ARCH_TAG_VERSION="$tag_version" perl -0pe '
  s/^pkgver=.*/pkgver=$ENV{ARCH_PKGVER}/m;
  s/^_commit=.*$/_commit=$ENV{ARCH_COMMIT_SHA} # tags\/$ENV{ARCH_TAG_VERSION}/m;
' "$template_file" > "$OUT_DIR/PKGBUILD"

(
  cd "$OUT_DIR"
  makepkg --printsrcinfo > .SRCINFO
)

cp -f "$OUT_DIR/PKGBUILD" "$DIST_DIR/${pkgname}.PKGBUILD"
cp -f "$OUT_DIR/.SRCINFO" "$DIST_DIR/${pkgname}.SRCINFO"
if [ -n "$AUR_REPO_DIR" ] && [ -d "$AUR_REPO_DIR" ] && [ -w "$AUR_REPO_DIR" ]; then
  cp -f "$OUT_DIR/PKGBUILD" "$AUR_REPO_DIR/PKGBUILD"
  cp -f "$OUT_DIR/.SRCINFO" "$AUR_REPO_DIR/.SRCINFO"
elif [ -n "$AUR_REPO_DIR" ] && [ -d "$AUR_REPO_DIR" ]; then
  echo "Skipping copy to $AUR_REPO_DIR because it is not writable"
fi

pkgdest="$OUT_DIR/packages"
srcdest="$OUT_DIR/sources"
logdest="$OUT_DIR/logs"
builddir="$OUT_DIR/build"
mkdir -p "$pkgdest" "$srcdest" "$logdest" "$builddir"

find "$DIST_DIR" -maxdepth 1 -type f -name "${pkgname}-*.pkg.tar.*" -delete
find "$pkgdest" -maxdepth 1 -type f -name "${pkgname}-*.pkg.tar.*" -delete

sed "s|git+${source_repo}#commit=\\\$_commit|git+${build_source_repo}#commit=\\\$_commit|" \
  "$OUT_DIR/PKGBUILD" > "$builddir/PKGBUILD"

cat >>"$builddir/PKGBUILD" <<EOF

pkgver() {
  cd "\$srcdir/desktop-icons-ng"
  printf '%s+g%s\n' "${pkgver}" "\$(git rev-parse --short HEAD)"
}
EOF

(
  cd "$builddir"
  PKGDEST="$pkgdest" SRCDEST="$srcdest" LOGDEST="$logdest" makepkg $MAKEPKG_FLAGS
)

shopt -s nullglob
arch_packages=( "$pkgdest"/*.pkg.tar.* )
shopt -u nullglob
if [ ${#arch_packages[@]} -gt 0 ]; then
  cp -f "${arch_packages[@]}" "$DIST_DIR"/
fi

echo "Built Arch packaging metadata and package in $OUT_DIR"
