# Multi-tool GitHub Chinese Localization Workbench

A desktop workbench (`v0.1.5`) that automatically detects installed instances of Claude Code, Claude Desktop, Antigravity, Cursor, Codex Desktop, Kiro IDE, and OpenCode, binds them to active GitHub Chinese localization repositories, and provides visual configuration and one-click localization/restoration.

> Current status: runnable MVP. Real detection and localization checks cover all three tools. Claude Code applies and uninstalls localization through the official plugin extension point. Claude Desktop downloads a pinned community source (commit + SHA-256, UAC elevation) and runs its installer on user confirmation; the real elevated install is not yet accepted on a physical machine. Antigravity's upstream dictionary only matches v2.28.2, so writes stay disabled on other versions. Supported versions and verification scope are recorded in the [support matrix](doc/support-matrix.md) (Chinese).

## Implemented

| Capability | Status | Notes |
| --- | --- | --- |
| Modern desktop UI | Done | Sidebar, search, filters, tool cards, details drawer, light/dark/system themes |
| Claude Code detection | Done | CLI via `where`/`which`, npm global, native install, manual path; VS Code / Cursor / Windsurf extensions; Windows and Linux |
| Claude Desktop detection | Done | Windows: `%LOCALAPPDATA%\AnthropicClaude\app-*` and MSIX; Linux: deb install at `/usr/lib/claude-desktop` |
| Antigravity detection | Done | Windows registry and default paths; Linux `~/.local/share`, `/opt`, `/usr/share`, Snap, Flatpak; manual path |
| Localization status | Done | Distinguishes not localized, managed by this app, external localization, config error, and unconfirmed Chinese resources |
| Apply localization (Claude Code) | Done | Copies the bundled `cc-zh` plugin, merges user-level `settings.json`, backs up first; an enabled third-party Chinese plugin is disabled and recorded first; Windows and Linux |
| Uninstall localization (Claude Code) | Done | Removes only entries written by this app; keeps other plugins and later user edits; re-enables external plugins it disabled |
| Claude Desktop community source | Implemented, not accepted on a real machine | Downloads a pinned commit of `javaht/claude-desktop-zh-cn` (MIT), verifies the archive SHA-256, then runs the upstream installer; requires UAC elevation and invalidates the signature; Windows, Claude 4.29+ |
| Antigravity community source | Version-gated | `Silas-02/antigravity-desktop-cn` (no upstream license) is registered for Windows, but its dictionary only matches v2.28.2; no download or write happens on other versions or platforms |
| Update check and install | Done | Automatic check on startup (can be disabled); user-confirmed download with metadata hash verification, then a second confirmation to install; optional GitHub mirror |
| Windows / Ubuntu installers | Done | NSIS `.exe`, AppImage, `.deb`; unsigned, built locally or by GitHub Actions |
| Silent auto-update | Not implemented | Both download and install require user confirmation; never installs on quit |

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
- Settings checks for the latest version; "Download update" verifies the sha512 in the update metadata; "Install and restart" runs only after user confirmation and never installs on quit.
- Custom GitHub mirrors are supported: the mirror must serve `latest.yml` (`latest-linux.yml` on Linux) plus installers, and is used for both version checks and downloads. A mirror can replace update content, so only trusted addresses should be configured.
- The release workflow verifies and uploads `latest.yml` / `latest-linux.yml`; a build fails when the metadata is missing.
- Current version is `0.1.3`, with Windows and Ubuntu installers. Pushing a `vX.Y.Z` tag builds and uploads them via GitHub Actions.

## Third-party localization credits

This app is an integration tool: it detects, installs, uninstalls, and verifies localization, but it does not own the translation content.

| Resource | Author | Source | License | Usage |
| --- | --- | --- | --- | --- |
| cc-zh 0.1.0 | jnq | [jiangnanquan/claude-code-zh](https://github.com/jiangnanquan/claude-code-zh) | MIT | Installed through the official Claude Code plugin extension point |
| Claude Desktop community localization | javaht | [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn) | MIT | Pinned to commit `444414d`; downloaded and run on request |
| Antigravity community localization | Silas-02 | [Silas-02/antigravity-desktop-cn](https://github.com/Silas-02/antigravity-desktop-cn) | Not declared | Pinned to commit `bd9d60a`; downloaded at runtime, never bundled or redistributed |

- Settings shows the author, source, and license for bundled resources and links to the repository.
- Plugin sources and licenses ship with the app under `app/vendor/cc-zh/` and `app/resources/plugins/cc-zh/THIRD_PARTY.md`.
- This app does not modify the plugin content and does not redistribute Claude Code, Claude Desktop, or Antigravity themselves.

Candidate tools and localization projects, including their maintenance status and licenses, are surveyed in [doc/ecosystem.md](doc/ecosystem.md) (Chinese). Being listed in the survey does not mean the app supports the tool; projects without a confirmed license are neither bundled nor redistributed.

## Scope and safety

- Read-only detection; reference projects under `example/` are researched, not executed.
- Only user-visible text is localized; JSON keys, enum values, env var names, tool names, commands, and paths stay unchanged.
- Uninstall restores only changes this app can verify; it never uninstalls the target software or deletes user data.
- Community sources are pinned to a commit and verified by archive SHA-256 before extraction. The preview shows the repository, commit, license, commands, and risks; nothing is downloaded or run without confirmation. A hash proves integrity against the registered value, not the author's identity.
- The app does not force-kill target processes. Antigravity must be closed by the user and is run with `--no-kill`; Claude Desktop's upstream installer closes its own client, which the preview states.
- Elevation is off by default with one exception: on Windows, the Claude Desktop community install/uninstall elevates through UAC after user confirmation, using `Start-Process -Verb RunAs -Wait` and recording the exit code and log.
- External localization, unknown versions, unreadable configuration, and missing backups do not silently proceed. A registered external Chinese plugin with a supported CLI version can be explicitly replaced by the bundled localization: the external plugin is disabled in `enabledPlugins` and its previous value is recorded; uninstalling restores only entries this app still has disabled. Plugin files and any program-file changes made by the external plugin are not reverted.
- Offline by default; network requests happen only for the startup version check, a manual check, a user-confirmed update download, or a user-confirmed community-source download. A configured mirror receives update requests. No telemetry, remote upload, or online translation.

Verification level matters: environment-isolated apply/uninstall runs are not the same as confirming the localized UI in a real client. See [doc/support-matrix.md](doc/support-matrix.md) for exactly what was verified.

## Documentation

- [Project overview and capabilities](README.md) (Chinese, authoritative)
- [Agent development guidelines](AGENTS.md)
- [Task plan](doc/task.md)
- [Support matrix](doc/support-matrix.md)
- [Ecosystem and localization projects survey](doc/ecosystem.md) (Chinese)
- [Changelog](CHANGELOG.md)
