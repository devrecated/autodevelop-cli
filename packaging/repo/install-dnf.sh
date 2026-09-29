#!/usr/bin/env bash
# Add the autodevelop dnf/yum repo and install autodevelop.
set -euo pipefail
REPO_URL="${REPO_URL:-@REPO_URL@}"
if [ "$(id -u)" -ne 0 ]; then
  echo "re-run with sudo" >&2
  exit 1
fi
curl -fsSL "${REPO_URL}/autodevelop.repo" -o /etc/yum.repos.d/autodevelop.repo
if command -v dnf >/dev/null 2>&1; then
  dnf install -y autodevelop
elif command -v yum >/dev/null 2>&1; then
  yum install -y autodevelop
else
  echo "need dnf or yum" >&2
  exit 1
fi
echo "OK: $(autodevelop version)"
