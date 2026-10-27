#!/bin/sh
# Build subtitle-qc-kit.zip for the reviewer: the skill archive, the transcript setup and the guide.
# Rebuilds skill/subtitle-qc.skill first. Run after any change to the skill or the kit.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$HERE/.."
(cd "$SKILL_DIR" && rm -f subtitle-qc.skill && zip -qrX subtitle-qc.skill subtitle-qc -x '*/__pycache__/*' -x '*.DS_Store')
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PKG="$TMP/subtitle-qc-kit"
mkdir -p "$PKG"
cp "$SKILL_DIR/subtitle-qc.skill" "$HERE/setup.sh" "$SKILL_DIR/subtitle-qc/scripts/transcribe.sh" "$PKG/"
cp "$HERE/GUIDE.md" "$PKG/README.md"
rm -f "$HERE/subtitle-qc-kit.zip"
(cd "$TMP" && zip -qrX "$HERE/subtitle-qc-kit.zip" subtitle-qc-kit)
unzip -l "$HERE/subtitle-qc-kit.zip" | tail -n +4 | sed '$d' | sed '$d'
