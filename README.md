# Autodevelop CLI (Go)

Copyright (c) 2026 Devrecated.

Standalone binary for login, kit install, MCP stdio (`mcp`, `kit-mcp`), and editor hooks (`hook <id>`).
No Node runtime required after install.

## Install

```bash
# Homebrew (after tap exists)
brew install --cask devrecated/tap/autodevelop

# curl
curl -fsSL https://raw.githubusercontent.com/devrecated/autodevelop-cli/main/scripts/install.sh | bash

# npm (downloads the binary in postinstall)
npm install -g @devrecated/autodevelop

# AUR
yay -S autodevelop-bin
```

See [packaging/README.md](packaging/README.md) for apt, dnf, Scoop, and winget.

## Usage

```bash
autodevelop login                  # prompts for repo dir (default: git root / cwd)
autodevelop login --dir /path/to/repo --no-open
autodevelop status
autodevelop install --slug <instance>
autodevelop mcp                    # host stdio shim (loopback)
autodevelop kit-mcp                # kit tools stdio
autodevelop hook guard-shell       # editor hook
```

## Develop

```bash
go build -o bin/autodevelop ./cmd/autodevelop
go test ./...
```

The legacy Node sources under `src/` remain for reference during the port; the shipped customer artifact is this Go binary.
