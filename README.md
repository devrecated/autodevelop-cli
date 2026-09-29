# Autodevelop CLI (Go)

Copyright (c) 2026 Devrecated.

Standalone binary for login, kit install, MCP stdio (`mcp`, `kit-mcp`), and editor hooks (`hook <id>`).
No Node runtime required after install.

## Install

```bash
# Homebrew
brew install --cask devrecated/tap/autodevelop

# curl (GitHub Release binary)
curl -fsSL https://raw.githubusercontent.com/devrecated/autodevelop-cli/main/scripts/install.sh | bash

# apt (Debian / Ubuntu) — adds the Devrecated package repo, then installs
curl -fsSL https://devrecated.github.io/packages/install-apt.sh | sudo bash

# dnf / yum (Fedora / RHEL-ish) — same idea
curl -fsSL https://devrecated.github.io/packages/install-dnf.sh | sudo bash

# npm (downloads the matching Release binary in postinstall)
npm install -g @devrecated/autodevelop

# AUR
yay -S autodevelop-bin
```

### apt / dnf without the installer script

Add the package mirror **before** `apt install` / `dnf install`. Plain `apt install autodevelop` fails until the Devrecated repo is on the machine.

```bash
# Debian / Ubuntu — add repo, then install
curl -fsSL https://devrecated.github.io/packages/autodevelop.list \
  | sudo tee /etc/apt/sources.list.d/autodevelop.list >/dev/null
sudo apt-get update
sudo apt-get install -y autodevelop

# Fedora / RHEL-ish
curl -fsSL https://devrecated.github.io/packages/autodevelop.repo \
  | sudo tee /etc/yum.repos.d/autodevelop.repo >/dev/null
sudo dnf install -y autodevelop
```

Repo index: https://devrecated.github.io/packages/  
More channels (Scoop, winget, signing notes): [packaging/README.md](packaging/README.md).

## Usage

```bash
autodevelop login                  # prompts for repo dir (default: git root / cwd)
autodevelop login --dir /path/to/repo --profile acme --no-open
autodevelop status                 # Profile / Host / Current Project (github.com/owner/repo)
autodevelop profiles
autodevelop install --slug <instance>
autodevelop mcp                    # host stdio shim (loopback)
autodevelop kit-mcp                # kit tools stdio
autodevelop hook guard-shell       # editor hook
```

Multiple orgs: `login --profile <name>` stores another credential. Login also binds the repo’s GitHub origin (`github.com/owner/repo`) to that profile, so another Cursor window in a different repo picks its org from cwd without fighting a single global active profile. Override with `AUTODEVELOP_PROFILE` or `--profile` when needed.

## Develop

```bash
go build -o bin/autodevelop ./cmd/autodevelop
go test ./...
```

The legacy Node sources under `src/` remain for reference during the port; the shipped customer artifact is this Go binary.
