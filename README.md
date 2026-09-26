# @devrecated/autodevelop

CLI for **AutoDevelop**, Devrecated’s flagship agentic coding service.

Learn more at [devrecated.com](https://devrecated.com) and [autodevelop.devrecated.com](https://autodevelop.devrecated.com).

Public npm package for Autodevelop customers. Source and releases live in [`devrecated/autodevelop-cli`](https://github.com/devrecated/autodevelop-cli). The hosted kit and org policy pack still require login — they are not in this package.

## Quickstart

> **Install once, then use `npx` everywhere.**

```bash
npm install -g @devrecated/autodevelop
```

Or run on demand without installing:

```bash
npx @devrecated/autodevelop login
```

From there, follow the happy path:

```bash
npx @devrecated/autodevelop login          # sign in, apply kit + policy pack
npx @devrecated/autodevelop status         # signed-in state, host, org, pack version
npx @devrecated/autodevelop github init    # install the GitHub App for your org
npx @devrecated/autodevelop github status  # confirm the App is connected
```

Re-apply or check your environment any time:

```bash
npx @devrecated/autodevelop install        # re-download kit + policy pack
npx @devrecated/autodevelop github token   # mint a short-lived install token
npx @devrecated/autodevelop logout         # clear stored credential
```

See everything available:

```bash
npx @devrecated/autodevelop --help
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
| `mcp` | Starts the Autodevelop MCP stdio server (used by Cursor; you rarely run this by hand). |

## Configuration

- `login` writes your credential to `~/.config/autodevelop/credentials.json` and wires Cursor MCP into the current repo.
- Set `AUTODEVELOP_HOST` if your host is not the default; `AUTODEVELOP_TOKEN` overrides a stored credential for one process.

## License

Copyright (c) 2026 Devrecated. See `LICENSE`.