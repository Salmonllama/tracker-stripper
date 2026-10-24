#!/bin/sh
# Packages the extension into dist/tracker-stripper-<version>.zip.
# The zip holds a single "tracker-stripper" folder, ready for "Load unpacked".
set -eu
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT="dist/tracker-stripper-$VERSION.zip"
STAGE="dist/stage/tracker-stripper"

rm -rf dist
mkdir -p "$STAGE"
cp -r manifest.json background.js README.md lib content offscreen options icons "$STAGE/"
(cd dist/stage && zip -qr "../$(basename "$OUT")" tracker-stripper)
rm -rf dist/stage

echo "$OUT"
