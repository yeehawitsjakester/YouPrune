#!/usr/bin/env bash
# YouPrune — cut a GitHub (pre-)release with the built .zip attached.
#
# Tags the current commit and publishes a release carrying the packed zip.
# Alpha/beta/rc versions (version_name containing a '-') are published as
# GitHub *pre-releases* automatically.
#
# Usage:
#   ./scripts/release.sh            # tag = v<version_name>, notes auto-generated
#   ./scripts/release.sh "notes..." # custom release notes
#
# Requires: gh (authenticated), a clean-ish working tree, the commit pushed.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(jq -r '.version_name // .version' manifest.json)"
TAG="v${VERSION}"
NOTES="${1:-Alpha build ${VERSION}}"

# Pre-release if the version carries a pre-release suffix like -alpha / -beta.
PRERELEASE_FLAG=""
case "$VERSION" in
  *-*) PRERELEASE_FLAG="--prerelease" ;;
esac

# Build fresh.
./scripts/pack.sh >/dev/null
ZIP="dist/youprune-${VERSION}.zip"
[ -f "$ZIP" ] || { echo "error: $ZIP not found" >&2; exit 1; }

# Warn if there are uncommitted changes — the release points at a commit.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "warning: working tree has uncommitted changes; release will tag the last commit." >&2
fi

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG already exists. Bump version_name in manifest.json first." >&2
  exit 1
fi

echo "Creating release $TAG ${PRERELEASE_FLAG:+(pre-release)}..."
gh release create "$TAG" "$ZIP" \
  --title "$TAG" \
  --notes "$NOTES" \
  $PRERELEASE_FLAG

echo "Done: $(gh release view "$TAG" --json url -q .url)"
