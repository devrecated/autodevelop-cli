# Changelog

Copyright (c) 2026 Devrecated.

## Unreleased

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
