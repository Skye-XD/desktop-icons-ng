#!/usr/bin/env bash
set -e

VERSION="${VERSION:-100.8}"

$PWD/scripts/make-rpm.sh
$PWD/scripts/make-deb.sh
$PWD/scripts/export-zip.sh