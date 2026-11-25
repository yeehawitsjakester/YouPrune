#!/usr/bin/env bash
# YouPrune — build a distributable .zip of the extension.
#
# Produces dist/youprune-<version_name>.zip containing only the files the
# browser needs. This is NOT for "load unpacked" day-to-day testing (just use
# the folder + reload in brave://extensions for that) — it's a versioned,
# archivable snapshot for GitHub releases or a Web Store upload.
#
# Usage: ./scripts/pack.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Prefer the display version_name (may carry -alpha), fall back to version.
VERSION="$(jq -r '.version_name // .version' manifest.json)"
OUT="dist/youprune-${VERSION}.zip"

# Files that ship in the extension. Keep this list tight — no scripts, no .git,
# no source SVG, no dist.
INCLUDE=(
  manifest.json
  README.md
  src
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
)

mkdir -p dist
rm -f "$OUT"

# -r recurse dirs, -X strip extra file attributes for a reproducible zip.
zip -r -X "$OUT" "${INCLUDE[@]}" >/dev/null

echo "Built $OUT"
echo "Contents:"
unzip -l "$OUT" | tail -n +2
