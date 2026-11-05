#!/bin/bash
# Package build-desktop/dist/OutLab.app into a drag-to-Applications disk image.
# Usage: desktop/macos/make_dmg.sh <output.dmg>
set -euo pipefail
out="${1:?output dmg path}"
app="build-desktop/dist/OutLab.app"
[[ -d "$app" ]] || { echo "Missing $app; run PyInstaller first." >&2; exit 1; }

# Ad-hoc signature for the whole bundle (required to run on Apple Silicon).
# It is not a Developer ID signature: macOS will ask the user to allow the app once.
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"

staging="$(mktemp -d)"
cp -R "$app" "$staging/"
ln -s /Applications "$staging/Applications"
mkdir -p "$(dirname "$out")"
hdiutil create -volname "OutLab" -srcfolder "$staging" -ov -format UDZO "$out"
rm -rf "$staging"
echo "Created $out"
