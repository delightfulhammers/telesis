#!/bin/bash
set -euo pipefail

# Telesis release script
# Cross-compiles for all platforms, creates a GitHub Release, and uploads binaries.
#
# Usage:
#   ./scripts/release.sh              # build + publish
#   ./scripts/release.sh --build-only # build archives without publishing
#
# Requirements: bun, gh (GitHub CLI, authenticated), tar

DIST_DIR="dist"
BUILD_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --build-only) BUILD_ONLY=true ;;
    --dist=*) DIST_DIR="${arg#--dist=}" ;;
  esac
done

VERSION=$(jq -r '.version' package.json)
TAG="v$VERSION"

TARGETS=(
  "darwin:arm64:bun-darwin-arm64"
  "darwin:x64:bun-darwin-x64"
  "linux:x64:bun-linux-x64"
  "linux:arm64:bun-linux-arm64"
)

echo "Building Telesis $TAG for all platforms..."
echo ""

mkdir -p "$DIST_DIR"
ARCHIVES=()

for target_spec in "${TARGETS[@]}"; do
  IFS=':' read -r OS ARCH BUN_TARGET <<< "$target_spec"
  PLATFORM_DIR="$DIST_DIR/telesis-$TAG-$OS-$ARCH"
  ARCHIVE_NAME="telesis-$TAG-$OS-$ARCH.tar.gz"
  ARCHIVE_PATH="$DIST_DIR/$ARCHIVE_NAME"

  echo "Building $OS-$ARCH..."
  mkdir -p "$PLATFORM_DIR"

  bun build src/index.ts --compile --target="$BUN_TARGET" --outfile="$PLATFORM_DIR/telesis" 2>&1 | tail -1
  bun build src/mcp-server.ts --compile --target="$BUN_TARGET" --outfile="$PLATFORM_DIR/telesis-mcp" 2>&1 | tail -1

  tar -czf "$ARCHIVE_PATH" -C "$DIST_DIR" "telesis-$TAG-$OS-$ARCH"
  echo "  → $ARCHIVE_NAME"

  ARCHIVES+=("$ARCHIVE_PATH")
done

echo ""
echo "Built ${#ARCHIVES[@]} archives."

if [ "$BUILD_ONLY" = true ]; then
  echo "Build complete (--build-only, skipping publish)."
  exit 0
fi

# Check if release already exists
if gh release view "$TAG" &>/dev/null; then
  echo "Error: Release $TAG already exists."
  exit 1
fi

echo ""
echo "Publishing to GitHub Releases..."
gh release create "$TAG" "${ARCHIVES[@]}" --title "Telesis $TAG" --generate-notes

echo "Published: $TAG"
