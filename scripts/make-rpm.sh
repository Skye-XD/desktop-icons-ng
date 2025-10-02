#!/usr/bin/env bash
set -e

PKG_NAME="${PKG_NAME:-gnome-shell-extension-adw-desktop-icons}"
VERSION="${VERSION:-100.8}"
# RPM macro to set dist
RELEASE="${RELEASE:-1%{?dist}}"
SUMMARY="${SUMMARY:-Adw/Gtk4 Fork of Desktop Icons NG Extension that displays icons on the Desktop in Gnome}"
LICENSE_TEXT="${LICENSE_TEXT:-GPL-3.0-or-later}"
URL="${URL:-https://gitlab.com/smedius/desktop-icons-ng}"
PREFIX="${PREFIX:-/usr}"
NOARCH="${NOARCH:-1}"
LOCALE_DOMAIN="${LOCALE_DOMAIN:-gtk4-ding}"

REQUIRES="${REQUIRES:-gnome-shell >= 45, \
         gnome-shell < 50, \
         gjs, \
         nautilus >= 3.38, \
         gsettings-desktop-schemas}"

TOPDIR="$PWD/rpmbuild"
SOURCEDIR="$TOPDIR/SOURCES"
SPECDIR="$TOPDIR/SPECS"
BUILDDIR="$TOPDIR/BUILD"
BUILDROOT="$TOPDIR/BUILDROOT"
RPMDIR="$TOPDIR/RPMS"
SRPMDIR="$TOPDIR/SRPMS"
SPECFILE="$SPECDIR/${PKG_NAME}.spec"

mkdir -p "$SOURCEDIR" "$SPECDIR" "$BUILDDIR" "$BUILDROOT" "$RPMDIR" "$SRPMDIR"

BUILD_DIR="${BUILD_DIR:-build}"

if [ ! -d "$BUILD_DIR" ]; then
  meson setup "$BUILD_DIR" --prefix="$PREFIX" --buildtype=release
fi

meson dist -C "$BUILD_DIR" --allow-dirty

DISTDIR="$BUILD_DIR/meson-dist"
shopt -s nullglob
tarballs=( "$DISTDIR"/*.tar.xz )
shopt -u nullglob
if [ ${#tarballs[@]} -eq 0 ]; then
  echo "No dist tarballs found in $DISTDIR" >&2
  exit 1
fi

TARBALL_SRC="$(ls -t "$DISTDIR"/*.tar.xz | head -n1)"
EXTRACT_DIR="$(tar -tf "$TARBALL_SRC" | head -n1 | sed 's@/.*@@')"
TARBALL_BASENAME="$(basename "$TARBALL_SRC")"
cp -f "$TARBALL_SRC" "$SOURCEDIR/$TARBALL_BASENAME"


cat >"$SPECFILE" <<EOF
Name:           ${PKG_NAME}
Version:        ${VERSION}
Release:        ${RELEASE}
Summary:        ${SUMMARY}
License:        ${LICENSE_TEXT}
$( [ -n "$URL" ] && echo "URL:            $URL" )
Source0:        ${TARBALL_BASENAME}
$( [ "$NOARCH" = "1" ] && echo "BuildArch:      noarch" )
BuildRequires:  meson, ninja-build, gettext
Requires:       ${REQUIRES}

%description
${SUMMARY}

%prep
%setup -q -n ${EXTRACT_DIR}

%build
meson setup _build --prefix=%{_prefix} --buildtype=release
meson compile -C _build

%install
rm -rf %{buildroot}
meson install -C _build --destdir %{buildroot}

find "%{buildroot}%{_prefix}" -xtype f -o -type f -o -type l | sed "s|%{buildroot}||" > filelist || :

# Restart AppArmor if present and active
%post
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet apparmor.service; then
    echo 'Reloading AppArmor profiles...'
    systemctl restart apparmor.service >/dev/null 2>&1 || :
  fi
fi

%postun
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet apparmor.service; then
    echo 'Reloading AppArmor profiles (postun)...'
    systemctl restart apparmor.service >/dev/null 2>&1 || :
  fi
fi

%files -f filelist
%defattr(-,root,root,-)
%attr(0644,root,root) %config(noreplace) /etc/apparmor.d/gtk4-desktop-icons
%license  COPYING*
%doc README*  HISTORY*

%changelog
* $(date +"%a %b %d %Y") Sundeep Mediratta <smedius@gmail.com> - ${VERSION}-${RELEASE}
- Initial RPM build
EOF

rpmbuild -bb "$SPECFILE" \
  --define "_topdir $TOPDIR" \
  --define "_sourcedir $SOURCEDIR" \
  --define "_specdir $SPECDIR" \
  --define "_builddir $BUILDDIR" \
  --define "_buildrootdir $BUILDROOT" \
  --define "_rpmdir $RPMDIR" \
  --define "_srcrpmdir $SRPMDIR" \
  --define "_prefix $PREFIX" \
  --define "LOCALE_DOMAIN $LOCALE_DOMAIN"

echo "RPMS => $TOPDIR/RPMS/*/*.rpm"
