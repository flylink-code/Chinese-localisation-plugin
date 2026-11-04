# Multi-tool Chinese Localization Manager

A desktop app that detects installed instances of Claude Code, Claude Desktop, and Antigravity, reports their localization status, and applies or uninstalls Chinese localization where support has been verified.

> Current status: runnable MVP. Real detection and localization checks cover all three tools; Claude Code CLI can apply and uninstall localization through the official plugin extension point. Claude Desktop and Antigravity are detect-only for now. Supported versions and verification scope are recorded in the [support matrix](doc/support-matrix.md) (Chinese).

## Implemented

| Capability | Status | Notes |
| --- | --- | --- |
| Modern desktop UI | Done | Sidebar, search, filters, tool cards, details drawer, light/dark/system themes |
| Claude Code detection | Done | CLI via `where`/`which`, npm global, native install, manual path; VS Code / Cursor / Windsurf extensions; Windows and Linux |
| Claude Desktop detection | Done | Windows: `%LOCALAPPDATA%\AnthropicClaude\app-*` and MSIX; Linux: deb install at `/usr/lib/claude-desktop` |
| Antigravity detection | Done | Windows registry and default paths; Linux `~/.local/share`, `/opt`, `/usr/share`, Snap, Flatpak; manual path |
| Localization status | Done | Distinguishes not localized, managed by this app, external localization, config error, and unconfirmed Chinese resources |
| Apply localization (Claude Code) | Done | Copies the bundled `cc-zh` plugin, merges user-level `settings.json`, backs up first; Windows and Linux |
| Uninstall localization (Claude Code) | Done | Removes only entries written by this app; keeps other plugins and later user edits |
| GitHub update check | Done | Manual check of the latest Release from Settings; opens the release page, never downloads or installs |
| Windows / Ubuntu installers | Done | NSIS `.exe`, AppImage, `.deb`; unsigned, built locally or by GitHub Actions |
| Desktop / Antigravity writes | Not implemented | Detect-only; reference installers are never executed |
| Auto-update | Not implemented | Update check only reports the version and opens the release page |

## Quick start

Requirements: Windows 10/11 or Ubuntu 22.04+, Node.js 20+.

Installers are published on GitHub Releases: a Windows NSIS installer plus Ubuntu AppImage and deb. They are unsigned; AppImage requires `libfuse2` and its desktop entry uses `--no-sandbox` (Electron AppImage limitation), so prefer the deb when the Chromium sandbox matters.

```bash
cd app
npm install
npm run build
npm start
```

Other commands:

```bash
npm test          # core detection/backup/restore unit tests
npm run typecheck # TypeScript type check
npm run dev       # build and launch
```

If your environment sets `ELECTRON_RUN_AS_NODE=1`, launch with `env -u ELECTRON_RUN_AS_NODE npm start`.

### Versioning and releases

- `app/package.json` `version` is the single source of truth; the UI and update check read it.
- To release: bump the version and [CHANGELOG.md](CHANGELOG.md), commit, tag `vX.Y.Z`, and publish a GitHub Release with the same tag.
- The Settings update check only reads the latest Release version and opens its page; it never downloads or replaces files.
- Current version is `0.1.0`, with Windows and Ubuntu installers. Pushing a `vX.Y.Z` tag builds and uploads them via GitHub Actions.

## Scope and safety

- Read-only detection; reference projects under `example/` are researched, not executed.
- Only user-visible text is localized; JSON keys, enum values, env var names, tool names, commands, and paths stay unchanged.
- Uninstall restores only changes this app can verify; it never uninstalls the target software or deletes user data.
- External localization, unknown versions, unreadable configuration, and missing backups disable writes.
- Offline by default; the only network call is the user-triggered GitHub Releases version check, which uploads no local data. No telemetry, remote upload, or online translation.

Verification level matters: environment-isolated apply/uninstall runs are not the same as confirming the localized UI in a real client. See [doc/support-matrix.md](doc/support-matrix.md) for exactly what was verified.

## Documentation

- [Project overview and capabilities](README.md) (Chinese, authoritative)
- [Agent development guidelines](AGENTS.md)
- [Task plan](doc/task.md)
- [Support matrix](doc/support-matrix.md)
- [Changelog](CHANGELOG.md)
