# Packaging

Copyright (c) 2026 Devrecated.

Tagged releases (`v*`) are built by GoReleaser (`.goreleaser.yaml` + `.github/workflows/release.yml`).

| Channel | User install | Source |
|--------|-------------------|--------|
| GitHub Release | `scripts/install.sh` / `install.ps1` | bare binaries + `.deb` / `.rpm` |
| Homebrew | `brew install --cask devrecated/tap/autodevelop` | `devrecated/homebrew-tap` (Cask) |
| apt | `curl …/install-apt.sh \| sudo bash` | Pages repo `devrecated/packages` |
| dnf | `curl …/install-dnf.sh \| sudo bash` | same Pages repo |
| pacman / AUR | `yay -S autodevelop-bin` | [`aur/`](aur/) |
| Scoop | `scoop bucket add devrecated …` then `scoop install autodevelop` | `devrecated/scoop-bucket` |
| winget | `winget install Devrecated.Autodevelop` (after PR merges) | [`winget/`](winget/) |
| npm | `npm i -g @devrecated/autodevelop` | [`npm/`](npm/) thin binary wrapper |

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
