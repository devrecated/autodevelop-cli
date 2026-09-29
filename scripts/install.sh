#!/usr/bin/env bash
# Install the latest Autodevelop CLI release binary from GitHub.
# Usage: curl -fsSL …/scripts/install.sh | bash
set -euo pipefail

REPO="${AUTODEVELOP_REPO:-devrecated/autodevelop-cli}"
ASSET_PREFIXES=("autodevelop_")
BIN_NAME="autodevelop"

die() { echo "install.sh: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "need '$1' on PATH"; }

need curl
need uname
need mktemp

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os" in
  darwin|linux) ;;
  msys*|cygwin*|mingw*)
    die "Windows detected — use scripts/install.ps1 or download the windows_amd64.zip asset"
    ;;
  *)
    die "unsupported OS: $os (supported: darwin, linux)"
    ;;
esac

case "$arch" in
  x86_64|amd64) arch="amd64" ;;
  aarch64|arm64) arch="arm64" ;;
  *) die "unsupported arch: $arch (supported: amd64, arm64)" ;;
esac

if [ -n "${TAG:-}" ]; then
  tag="$TAG"
elif [ -n "${VERSION:-}" ]; then
  tag="v${VERSION#v}"
else
  tag=""
fi

if [ -n "$tag" ]; then
  echo "Using release ${tag} for ${os}/${arch}…"
  api="https://api.github.com/repos/${REPO}/releases/tags/${tag}"
else
  echo "Detecting latest release for ${os}/${arch}…"
  api="https://api.github.com/repos/${REPO}/releases/latest"
fi
json="$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api")" || die "failed to fetch $api"

tag="$(printf '%s' "$json" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -n "$tag" ] || die "could not parse tag_name from GitHub API"
ver="${tag#v}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
tmpbin="${tmpdir}/${BIN_NAME}"

downloaded=0
for prefix in "${ASSET_PREFIXES[@]}"; do
  asset="${prefix}${ver}_${os}_${arch}"
  url="https://github.com/${REPO}/releases/download/${tag}/${asset}"
  echo "Trying ${url}"
  if curl -fsSL -o "$tmpbin" "$url"; then
    downloaded=1
    break
  fi
done
[ "$downloaded" -eq 1 ] || die "download failed for tag ${tag}"

chmod +x "$tmpbin"
install_dir="${AUTODEVELOP_INSTALL_DIR:-${HOME}/.local/bin}"
mkdir -p "$install_dir"
dest="${install_dir}/${BIN_NAME}"
install -m 755 "$tmpbin" "$dest"

# Gatekeeper: unsigned darwin binaries carry com.apple.quarantine from the download.
# Strip it so first launch is not blocked (until we notarize).
if [ "$os" = "darwin" ]; then
  if [ -w "$dest" ]; then
    xattr -d com.apple.quarantine "$dest" 2>/dev/null || true
  else
    sudo xattr -d com.apple.quarantine "$dest" 2>/dev/null || true
  fi
fi

echo "Installed ${dest} (${tag})"
case ":$PATH:" in
  *":${install_dir}:"*) ;;
  *) echo "Add ${install_dir} to PATH if needed." ;;
esac
"$dest" version || true
