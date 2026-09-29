#!/usr/bin/env bash
# Add the autodevelop apt repo and install autodevelop.
set -euo pipefail
REPO_URL="${REPO_URL:-@REPO_URL@}"
if [ "$(id -u)" -ne 0 ]; then
  echo "re-run with sudo" >&2
  exit 1
fi
curl -fsSL "${REPO_URL}/autodevelop.list" -o /etc/apt/sources.list.d/autodevelop.list
# Optional GPG key when present
if curl -fsSL "${REPO_URL}/autodevelop.asc" -o /usr/share/keyrings/autodevelop.asc 2>/dev/null; then
  sed -i 's/\[trusted=yes\]/[signed-by=\/usr\/share\/keyrings\/autodevelop.asc]/' /etc/apt/sources.list.d/autodevelop.list || true
fi
apt-get update -qq
apt-get install -y autodevelop
echo "OK: $(autodevelop version)"
