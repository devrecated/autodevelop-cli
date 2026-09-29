# macOS Gatekeeper / quarantine

Copyright (c) 2026 Devrecated.

Unsigned darwin binaries from GitHub Releases get `com.apple.quarantine`.
Gatekeeper then blocks first launch until notarized (Apple Developer ID).

## Immediate unblock (already-installed binary)

```bash
# Homebrew cask
xattr -dr com.apple.quarantine /opt/homebrew/Caskroom/autodevelop
# Intel Homebrew:
# xattr -dr com.apple.quarantine /usr/local/Caskroom/autodevelop

# Direct download / curl install
xattr -d com.apple.quarantine "$(command -v autodevelop)"
```

## What we ship

| Channel | Quarantine strip |
|--------|-------------------|
| `scripts/install.sh` | `xattr -d` after install |
| npm postinstall | `xattr -d` after download |
| Homebrew cask | GoReleaser `hooks.post.install` runs `xattr -dr` on `staged_path` |
| Direct Releases asset open | Manual one-liner above |

## Real fix

Apple Developer ID signing + notarization in the release pipeline. Until then the
`xattr` strips above are intentional.
