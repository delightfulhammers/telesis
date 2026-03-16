#!/bin/bash
set -euo pipefail

# Telesis installer
# Detects platform, downloads the latest release from GitHub, installs to PATH.
#
# Works with both public and private repos:
#   Public:  curl -fsSL https://raw.githubusercontent.com/delightfulhammers/telesis/main/install.sh | sh
#   Private: GITHUB_TOKEN=... curl -fsSL -H "Authorization: token $GITHUB_TOKEN" \
#              https://raw.githubusercontent.com/delightfulhammers/telesis/main/install.sh | sh
#
# Options (via environment variables):
#   TELESIS_VERSION=v0.27.0  Install a specific version (default: latest)
#   TELESIS_INSTALL_DIR=/usr/local/bin  Install directory (default: auto-detect)
#   GITHUB_TOKEN=ghp_...  Required for private repos

REPO="delightfulhammers/telesis"
VERSION="${TELESIS_VERSION:-}"
INSTALL_DIR="${TELESIS_INSTALL_DIR:-}"

# Build auth args array for curl (empty if no token)
build_auth_args() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "-H" "Authorization: token $GITHUB_TOKEN"
  fi
}

# Detect OS
detect_os() {
  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$os" in
    darwin) echo "darwin" ;;
    linux) echo "linux" ;;
    *)
      echo "Unsupported OS: $os" >&2
      exit 1
      ;;
  esac
}

# Detect architecture
detect_arch() {
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64) echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)
      echo "Unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac
}

# Determine install directory
detect_install_dir() {
  if [ -n "$INSTALL_DIR" ]; then
    echo "$INSTALL_DIR"
    return
  fi

  if [ -w "/usr/local/bin" ]; then
    echo "/usr/local/bin"
  else
    local dir="$HOME/.local/bin"
    mkdir -p "$dir"
    echo "$dir"
  fi
}

# Get latest release tag
get_latest_version() {
  if [ -n "$VERSION" ]; then
    echo "$VERSION"
    return
  fi

  local tag
  tag=$(curl -fsSL $(build_auth_args) "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
  if [ -z "$tag" ]; then
    echo "Failed to determine latest version" >&2
    exit 1
  fi
  if ! echo "$tag" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "Invalid version tag: $tag" >&2
    exit 1
  fi
  echo "$tag"
}

# Download a release asset. Tries direct URL first (public repos),
# falls back to API-based download (private repos).
download_asset() {
  local version="$1" archive_name="$2" dest="$3"

  local direct_url="https://github.com/$REPO/releases/download/${version}/${archive_name}"

  # Try direct download first (works for public repos, and some private configs)
  if curl -fSL $(build_auth_args) -o "$dest" "$direct_url" 2>/dev/null; then
    return 0
  fi

  # Fall back to API-based download (required for private repos).
  # Look up the asset ID, then download via the API with Accept: application/octet-stream.
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    local asset_url
    asset_url=$(curl -fsSL $(build_auth_args) \
      "https://api.github.com/repos/$REPO/releases/tags/${version}" \
      | grep -B3 "\"name\": \"${archive_name}\"" \
      | grep '"url"' \
      | sed -E 's/.*"url": *"([^"]+)".*/\1/' \
      | head -1)

    if [ -n "$asset_url" ]; then
      if curl -fSL \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/octet-stream" \
        -o "$dest" \
        "$asset_url" 2>/dev/null; then
        return 0
      fi
    fi
  fi

  return 1
}

main() {
  local os arch install_dir version archive_name tmp_dir

  os=$(detect_os)
  arch=$(detect_arch)
  install_dir=$(detect_install_dir)
  version=$(get_latest_version)

  archive_name="telesis-${version}-${os}-${arch}.tar.gz"

  echo "Installing Telesis ${version} (${os}-${arch})..."
  echo "  Target:  $install_dir"
  echo ""

  tmp_dir=$(mktemp -d)
  trap 'rm -rf "$tmp_dir"' EXIT

  # Download
  echo "Downloading..."
  if ! download_asset "$version" "$archive_name" "$tmp_dir/$archive_name"; then
    echo ""
    echo "Download failed. Check that version ${version} exists and has a ${os}-${arch} binary." >&2
    if [ -z "${GITHUB_TOKEN:-}" ]; then
      echo "For private repos, set GITHUB_TOKEN." >&2
    fi
    echo "Available releases: https://github.com/$REPO/releases" >&2
    exit 1
  fi

  # Extract
  echo "Extracting..."
  tar -xzf "$tmp_dir/$archive_name" -C "$tmp_dir"

  # Find the extracted directory
  local extract_dir
  extract_dir=$(find "$tmp_dir" -maxdepth 1 -type d -name "telesis-*" | head -1)
  if [ -z "$extract_dir" ]; then
    echo "Failed to find extracted directory" >&2
    exit 1
  fi

  # Install binaries
  echo "Installing..."
  cp "$extract_dir/telesis" "$install_dir/telesis"
  chmod +x "$install_dir/telesis"

  if [ -f "$extract_dir/telesis-mcp" ]; then
    cp "$extract_dir/telesis-mcp" "$install_dir/telesis-mcp"
    chmod +x "$install_dir/telesis-mcp"
  fi

  echo ""
  echo "Telesis ${version} installed successfully!"
  echo "  telesis:     $install_dir/telesis"
  if [ -f "$install_dir/telesis-mcp" ]; then
    echo "  telesis-mcp: $install_dir/telesis-mcp"
  fi

  # Check if install dir is on PATH
  if ! echo "$PATH" | tr ':' '\n' | grep -q "^${install_dir}$"; then
    echo ""
    echo "Note: $install_dir is not on your PATH."
    echo "Add it with: export PATH=\"$install_dir:\$PATH\""
  fi
}

main
