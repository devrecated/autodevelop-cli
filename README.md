# @devrecated/autodevelop

CLI for **AutoDevelop**, Devrecated’s flagship agentic coding service.

Learn more at [devrecated.com](https://devrecated.com) and [autodevelop.devrecated.com](https://autodevelop.devrecated.com).

Public npm package for Autodevelop customers (`0.0.1-beta`). Listed on the public registry. Source and releases live in [`devrecated/autodevelop-cli`](https://github.com/devrecated/autodevelop-cli) (GitHub org **devrecated**). The hosted kit and org policy pack still require login — they are not in this package.

## Install

```bash
pnpm add @devrecated/autodevelop
# or
npm install @devrecated/autodevelop

npx autodevelop login
```

`login` signs you in, downloads the Autodevelop kit from the host into this repository, installs your organization’s policy pack, and wires Cursor MCP. Then open the GitHub App if needed:

```bash
npx autodevelop github init
```

Set `AUTODEVELOP_HOST` if your host is not the default. `AUTODEVELOP_TOKEN` overrides a stored credential for one process.

## Commands

| Command | What it does |
| --- | --- |
| `login` | Device login to Autodevelop. Applies the hosted kit and org policy pack unless you pass `--no-install`. Options: `--host`, `--slug`, `--profile`, `--no-install`, `--no-open`. |
| `logout` | Clears the stored credential (optional `--profile`). |
| `status` | Shows whether you are signed in, active profile, host, org, and local policy pack version. |
| `profiles` | Lists stored login profiles. Pass `--profile <name>` to select the active one. |
| `install` | Downloads the kit and org policy pack again (after you are already logged in). Optional `--slug`. |
| `github init` | Opens the Autodevelop GitHub App install page for your organization. |
| `github status` | Reports whether the host has recorded that GitHub App install. |
| `github token` | Mints a short-lived installation token; prints expiry and account, not the token itself. |
| `mcp` | Starts the Autodevelop MCP stdio server (used by Cursor; you rarely run this by hand). |

```bash
npx @devrecated/autodevelop --help
npx @devrecated/autodevelop login
npx @devrecated/autodevelop status
npx @devrecated/autodevelop install
npx @devrecated/autodevelop github init
npx @devrecated/autodevelop github status
npx @devrecated/autodevelop github token
npx @devrecated/autodevelop logout
```

## License

Copyright (c) 2026 Devrecated. See `LICENSE`.
