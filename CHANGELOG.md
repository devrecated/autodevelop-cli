# Changelog

Copyright (c) 2026 Devrecated.

## Unreleased

## v1.0.5

### Added
- `autodevelop login` lists repo copies of plugin-root slash commands and `.cursor/skills/autodevelop`, asks y/n, and on yes moves them to `.autodevelop/archive/`. Client folders and `autodevelop-internal` stay. A checkout without `kits/cursor` is not asked.

## v1.0.4

### Fixed
- Kit apply installs consumer skills only under `.cursor/skills/autodevelop` (never leaves `autodevelop-internal` on disk — that slug is employee-only).
- Drops leftover `.cursor/commands/staff` after kit apply; granular skills ship as flat `/<bucket>--<skill>` commands in the hosted kit.

## v1.0.3

### Fixed
- `connect --fix` binds the cwd GitHub project to the target profile (same as login) so `status` stays on that org.
- Longer host probe timeouts (2.5s reach / 4s entitlement) so hosted diagnose is less flaky behind edge filters.

## v1.0.2

### Fixed
- `connect` resolves the same project-bound profile as `status` (cwd GitHub origin), so diagnose matches the active org for this repo.

## v1.0.1

### Added
- `autodevelop connect [--fix]` — chat-friendly diagnose and safe autofix (switch hosted profile, clear repo Autodevelop MCP, rewrite `~/.cursor/mcp.json`).
- Host probe prefers `GET /ping`, falls back to `/health`.

### Fixed
- Host probe sets `User-Agent: autodevelop-cli/<version>` so edge filters do not stall the default Go client UA.
- Release workflow: npm publish failure no longer fails the job after GoReleaser / Homebrew already succeeded (npm org scope still needs a working token separately).

## v1.0.0

- First 1.x binary release (login, status, install, github, knowledge, mcp, kit-mcp, hooks).
