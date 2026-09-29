# Autodevelop npm wrapper

Copyright (c) 2026 Devrecated.

`npm install -g @devrecated/autodevelop` downloads the platform binary from
GitHub Releases into `vendor/` (see `install.js`). The `autodevelop` bin
executes that binary — the package does not ship Go sources.

Requires Node ≥ 18 for the postinstall downloader only. The CLI itself does
not need Node at runtime.
