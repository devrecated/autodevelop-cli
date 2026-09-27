# @devrecated/autodevelop

CLI for **AutoDevelop**, Devrecated’s flagship agentic coding service.

Learn more at [devrecated.com](https://devrecated.com) and [autodevelop.devrecated.com](https://autodevelop.devrecated.com).

Public npm package for Autodevelop customers. Source and releases live in [`devrecated/autodevelop-cli`](https://github.com/devrecated/autodevelop-cli). The hosted kit and org policy pack still require login — they are not in this package.

## Requirements

- Node.js **20+**
- A git repository (run commands from the project root)
- An Autodevelop account (device login)

## Install

```bash
npm install -g @devrecated/autodevelop
```

Or run on demand without a global install:

```bash
npx @devrecated/autodevelop login
```

## Quickstart

From your project root:

```bash
npx @devrecated/autodevelop login          # sign in, apply kit + policy pack, wire MCP
npx @devrecated/autodevelop status         # signed-in state, host, org, pack version
npx @devrecated/autodevelop github init    # install the GitHub App for your org
npx @devrecated/autodevelop github status  # confirm the App is connected
```

Re-apply or check your environment any time:

```bash
npx @devrecated/autodevelop install        # re-download kit + policy pack
npx @devrecated/autodevelop github token   # mint a short-lived install token
npx @devrecated/autodevelop logout         # clear stored credential
npx @devrecated/autodevelop --help
```

`login` (unless you pass `--no-install`) downloads the kit from the Autodevelop host, applies your organization policy pack, and wires **Cursor**, **Claude Code**, and **opencode** project MCP from the same install.

### Cursor

`login` / `install` wires Cursor in two places:

1. **Project MCP** — `.cursor/mcp.json` (and a root `mcp.json`) with:
   - `autodevelop` — stdio kit server under `.cursor/skills/.../mcp/server.mjs`
   - `autodevelop-host` — HTTP `https://<host>/mcp` when your credential host is remote, otherwise a local stdio shim
2. **User MCP** — `~/.cursor/mcp.json`, plus launchers under `~/.config/autodevelop/` (`kit-mcp.mjs`, `host-mcp.mjs`). When the `cursor` CLI is on your `PATH`, login also runs `cursor --add-mcp` for those server names.

Credential file: `~/.config/autodevelop/credentials.json` (never paste the token into Cursor Plugins).

After the **first** attach of those server names, start a new agent chat (a full window reload is only needed the first time). Then use Autodevelop tools from Cursor as usual.

```bash
npx @devrecated/autodevelop login
npx @devrecated/autodevelop status
```

### Claude (Claude Code)

The CLI targets **Claude Code**, not Claude Desktop. There is no Claude Desktop config writer in this package.

`login` / `install` writes:

1. **Project MCP** — `.mcp.json` with the same `autodevelop` (stdio kit) and `autodevelop-host` (HTTP or stdio) servers Claude Code loads from the project root
2. **Claude kit** — `.claude/` (commands, agents, rules, hooks adapter, `CLAUDE.md` if missing)

Claude Code hooks reuse the Cursor kit deciders under `.cursor/hooks/autodevelop/` that the same install lays down.

```bash
npx @devrecated/autodevelop login
# open the repo in Claude Code; project MCP and .claude/ are already in place
```

### OpenCode

`login` / `install` writes:

1. **Project config** — `.opencode/opencode.json` (`$schema`, MCP servers, and `instructions` pointing at `.opencode/AGENTS.md` when that file exists)
2. **opencode kit** — `.opencode/` (skills, agents, commands, guard plugin, `AGENTS.md` if missing)

MCP entries use opencode’s `local` / `remote` shapes (`autodevelop` local stdio; `autodevelop-host` remote URL when the host is not loopback).

```bash
npx @devrecated/autodevelop login
# open the repo in opencode; .opencode/ is already in place
```

## Commands

| Command | What it does |
| --- | --- |
| `--help` | List all commands and options. |
| `login` | Device login to Autodevelop. Applies the hosted kit and org policy pack unless you pass `--no-install`. Options: `--host`, `--slug`, `--profile`, `--no-install`, `--no-open`. |
| `status` | Shows whether you are signed in, active profile, host, org, and local policy pack version. |
| `install` | Downloads the kit and org policy pack again (after you are already logged in). Optional `--slug`. |
| `github init` | Opens the Autodevelop GitHub App install page for your organization. |
| `github status` | Reports whether the host has recorded that GitHub App install. |
| `github token` | Mints a short-lived installation token; prints expiry and account, not the token itself. |
| `logout` | Clears the stored credential (optional `--profile`). |
| `profiles` | Lists stored login profiles. Pass `--profile <name>` to select the active one. |
| `mcp` | Starts the Autodevelop MCP stdio server (used by IDE launchers; you rarely run this by hand). |

## Configuration

| Item | Where |
| --- | --- |
| Credential | `~/.config/autodevelop/credentials.json` |
| Cursor user MCP | `~/.cursor/mcp.json` |
| Cursor project MCP | `.cursor/mcp.json`, `mcp.json` |
| Claude Code project MCP | `.mcp.json` |
| Claude Code kit | `.claude/` |
| opencode config + kit | `.opencode/opencode.json`, `.opencode/` |

Environment:

- `AUTODEVELOP_HOST` — host origin when it is not the default
- `AUTODEVELOP_TOKEN` — overrides a stored credential for one process
- `AUTODEVELOP_PROFILE` — selects a stored login profile for one process
- `AUTODEVELOP_CREDENTIALS` — alternate credentials file path

## License

Copyright (c) 2026 Devrecated. See [`LICENSE.md`](./LICENSE.md).
