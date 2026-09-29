# Packaging

Copyright (c) 2026 Devrecated.

Tagged releases (`v*`) are built by GoReleaser (`.goreleaser.yaml` + `.github/workflows/release.yml`).

| Channel | User install | Source |
|--------|-------------------|--------|
| GitHub Release | `scripts/install.sh` / `install.ps1` | bare binaries + `.deb` / `.rpm` |
| Homebrew | `brew install --cask devrecated/tap/autodevelop` | `devrecated/homebrew-tap` (Cask) |
| apt | Add repo first, then install (see below) | Pages repo [`devrecated/packages`](https://devrecated.github.io/packages/) |
| dnf | Same — add repo before install | same Pages repo |
| pacman / AUR | `yay -S autodevelop-bin` | [`aur/`](aur/) |
| Scoop | `scoop bucket add devrecated …` then `scoop install autodevelop` | `devrecated/scoop-bucket` |
| winget | `winget install Devrecated.Autodevelop` (after PR merges) | [`winget/`](winget/) |
| npm | `npm i -g @devrecated/autodevelop` | [`npm/`](npm/) thin binary wrapper |

### apt / dnf

The package is not on Debian/Ubuntu/Fedora default mirrors. Add the Devrecated repo **before** install (the one-liners do both):

```bash
# One-liner (adds sources.list.d / yum.repos.d, then installs)
curl -fsSL https://devrecated.github.io/packages/install-apt.sh | sudo bash
curl -fsSL https://devrecated.github.io/packages/install-dnf.sh | sudo bash

# Manual — apt
curl -fsSL https://devrecated.github.io/packages/autodevelop.list \
  | sudo tee /etc/apt/sources.list.d/autodevelop.list >/dev/null
sudo apt-get update && sudo apt-get install -y autodevelop

# Manual — dnf
curl -fsSL https://devrecated.github.io/packages/autodevelop.repo \
  | sudo tee /etc/yum.repos.d/autodevelop.repo >/dev/null
sudo dnf install -y autodevelop
```

## Org repos (create once)

```bash
gh repo create devrecated/homebrew-tap --public --description "Homebrew tap for Devrecated CLIs" --add-readme
gh repo create devrecated/scoop-bucket --public --description "Scoop bucket for Devrecated CLIs" --add-readme
gh repo create devrecated/packages --public --description "apt + dnf repos for Devrecated (GitHub Pages)" --add-readme
```

## Secrets (on `devrecated/autodevelop-cli`)

| Secret / setup | Required for |
|--------|----------------|
| **Trusted Publisher** on npmjs.com for `@devrecated/autodevelop` → GitHub `devrecated/autodevelop-cli`, workflow `release.yml` | `npm publish` via OIDC (preferred; no long-lived token) |
| `NPM_TOKEN` | Fallback only if Trusted Publisher is not configured |
| `PACKAGING_TOKEN` | Push `homebrew-tap`, `scoop-bucket`, and `packages` |
| `HOMEBREW_TAP_TOKEN` / `SCOOP_TOKEN` | Optional overrides |
| `WINGET_PAT` | Auto-PR to `microsoft/winget-pkgs` |

If Release’s npm job was skipping, npm stayed on an old beta while GitHub Releases moved on. Trusted Publisher + `id-token: write` on `release.yml` is the fix.

## Local snapshot

```bash
go build -o bin/autodevelop ./cmd/autodevelop
# or: goreleaser release --snapshot --clean
```
