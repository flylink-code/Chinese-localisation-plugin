# 支持矩阵与验证记录

更新日期：2026年11月04日。平台：Windows 11、WSL Ubuntu 22.04。适用范围：本仓库当前 `app` 实现，不代表参考项目的完整能力。

验证级别：

- **源码可见**：阅读参考项目或实现代码得出，未运行。
- **实机检测**：在本机执行应用的真实只读检测。
- **隔离流程验证**：在临时用户目录执行应用/卸载，未使用真实用户配置。
- **真实客户端验证**：启动目标软件并人工确认界面与恢复效果。

| 工具 | 平台 | 检测 | 汉化状态 | 应用汉化 | 卸载汉化 | 已验证级别 |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code CLI | Windows | 支持 | 支持 | 支持 | 支持 | 实机检测 + 隔离流程验证 |
| Claude Code CLI | Ubuntu | 支持 | 支持 | 支持 | 支持 | WSL 隔离流程验证 |
| Claude Code IDE 扩展 | Windows | 支持 | 仅说明 CLI 插件不影响扩展 | 不支持 | 不支持 | 实机检测 |
| Claude Code IDE 扩展 | Ubuntu | 支持 | 仅说明 CLI 插件不影响扩展 | 不支持 | 不支持 | 源码可见 |
| Claude Desktop | Windows | 支持 | 支持 | 不支持 | 不支持 | 实机检测 |
| Claude Desktop | Ubuntu | 支持（deb） | 支持 | 不支持 | 不支持 | 隔离 fixture |
| Antigravity | Windows | 支持 | 支持 | 不支持 | 不支持 | 实机检测 |
| Antigravity | Ubuntu | 支持 | 支持 | 不支持 | 不支持 | 隔离 fixture |

## Claude Code CLI

- 检测结果：npm 全局安装，`%APPDATA%\npm\claude.cmd`，版本 2.1.316；同时检测到 VS Code 扩展 2.1.317 与 Cursor 扩展 2.1.312。
- 汉化检查：在 `~/.claude/plugins` 下发现外部插件 `claude-code-zh-cn` 2.23.0，界面标记为「外部汉化」，应用汉化入口被禁用。这是按设计避免覆盖其他插件，不代表本机未汉化。
- 应用方式：内置 `cc-zh` 0.1.0，要求 Claude Code CLI ≥ 2.1.287；写入 `~/.claude/settings.json` 的 `env.CLAUDE_CODE_PLUGIN_DIRS`，插件复制到应用数据目录。
- 隔离流程验证（临时 `USERPROFILE` / `APPDATA`）：
  - 应用前保留原有 `env.OTHER`、`language` 字段。
  - 生成 `settings.json` 与清单备份。
  - 应用后插件文件存在、配置包含插件目录、状态刷新为「已汉化」。
  - 卸载后恢复原字段、删除插件目录、安装状态清空、记录两条成功操作。
  - 真实用户 `~/.claude/settings.json` 哈希前后一致。
- 尚未验证：启动 Claude Code 后中文文案的实际渲染、真实用户环境下的应用、插件对各版本的覆盖一致性、占位符与终端宽度人工检查。
- 已知限制：权限确认对话框、欢迎屏、错误信息、`claude --help` 等不在插件覆盖范围；插件未命中的文案保持英文。

## Ubuntu 22.04

- Claude Code CLI：
  - 检测路径增加 `~/.local/bin`、`~/.npm-global/bin`、`/usr/local/bin`、`/usr/bin`、`/snap/bin`，并使用 `which claude`。
  - 版本读取沿用 `claude --version`，补充 `/usr/local/lib/node_modules`、`/usr/lib/node_modules`、`~/.npm-global/lib/node_modules` 的 `package.json`。
  - 在 WSL Ubuntu 22.04 的临时 `HOME` 中验证：`~/.local/bin/claude` 被发现，应用汉化后 `settings.json` 保留 `env.OTHER` 与 `language`，卸载后恢复并删除插件目录。
  - 插件由 Claude Code 官方插件扩展点加载，与 Windows 使用同一份 `cc-zh`；未在真实 Ubuntu 客户端验证中文渲染。
- Claude Desktop（deb）：
  - 参考项目仅支持 deb 安装，资源位于 `/usr/lib/claude-desktop/resources`，补丁需要用 `sudo` 修改系统目录并重打包 `app.asar`。
  - 本实现增加 `/usr/lib/claude-desktop` 只读检测，版本读取 `version` 文件或 `dpkg-query`；按“不自动提权”规则不提供写入。
  - 隔离 fixture 验证了资源布局与状态判断，未在真实 deb 安装上运行。
- Antigravity：
  - 参考项目声明支持 Linux（含 Ubuntu），检测候选包括 `~/.local/share/antigravity`、`/opt`、`/usr/share`、Snap 与 Flatpak。
  - 本实现接入上述只读路径；隔离 fixture 验证可发现 `~/.local/share/antigravity/resources/app.asar`。
  - 参考项目通过 ASAR 解包与代码注入实现汉化，本实现未接入该写入路径，因此 Ubuntu 上仍仅检测与状态查看。
- 安装包：在 WSL Ubuntu 22.04 构建 AppImage 与 deb；尚未在干净 Ubuntu 桌面安装启动，未验证 FUSE、图标与桌面菜单集成。

## Claude Code IDE 扩展

- 检测位置：`~/.vscode/extensions`、`~/.vscode-insiders/extensions`、`~/.cursor/extensions`、`~/.windsurf/extensions` 中以 `anthropic.claude-code-` 开头的目录。
- 可读取扩展 `package.json` 版本；界面独立于 CLI，CLI 插件不会改变扩展文案。
- 当前不提供 IDE 扩展汉化与卸载；无官方扩展点验证前不修改扩展文件。

## Claude Desktop

- 检测结果：MSIX / Microsoft Store 渠道，版本 4.4212.0，安装位于 `C:\Program Files\WindowsApps\Claude_4.4212.0.0_x64__pzs8sxrjxfjjc`。
- 检查项：`resources`、`ion-dist` 目录或 `ion-dist.asar`、`app.asar`、`.zh-cn-backups`、`i18n/zh-CN.json`，以及 `__claudeZh*` 注入标记。
- 当前结果：未检测到汉化补丁标记或备份，状态为「未汉化」。
- 不提供写入：参考项目涉及应用包替换、资源重打包、签名/ACL 变更和升级后恢复，尚未在本实现中完成安全验证；MSIX 受系统完整性保护时禁止提权绕过。
- 未验证：官方账号原生的中文界面、不同安装渠道的资源差异、升级后的备份归属、写入与恢复流程。

## Antigravity

- 检测结果：`%LOCALAPPDATA%\Programs\Antigravity`，从 `resources/app.asar` 的 `package.json` 读取版本 2.27.0。
- 检测来源：默认安装位置、注册表安装登记、手动路径；支持传入安装目录、`resources` 目录或 `app.asar`。
- 汉化检查：流式搜索 `app.asar` 中的 `__ANTIGRAVITY_CHINESE_LOCALIZATION_START__`，并检查 `app.asar.bak`。当前未发现标记或备份。
- 不提供写入：参考项目直接修改 `app.asar` 并注入 preload/menu/tray 等逻辑，存在版本失配、升级后旧备份恢复、签名变化等风险，尚未接入本实现。
- 未验证：不同版本的注入锚点、备份版本绑定、文件占用与恢复冲突、实际界面覆盖。

## 版本与兼容策略

- 检测结果绑定具体安装路径、版本、平台与渠道；一种版本的验证不自动推广到其他版本。
- 汉化状态组合资源/配置证据判断，不把「存在备份」直接当作「已生效」。
- 未知版本、配置无法解析、外部汉化、资源缺失时不提供写入操作。
- 参考项目声明、源码可见行为、本仓库测试、真实客户端验证分别记录，不合并为一个「支持」标记。

## 复验方法

1. 运行 `cd app && npm run build && npm start`，确认三类软件的检测结果与本表一致。
2. 运行 `npm test`，覆盖插件配置合并、卸载、备份、无效 JSON、ASAR 读取等核心逻辑。
3. 在隔离用户目录执行应用/卸载，检查 `settings.json`、插件目录、备份与操作记录。
4. 真实修改前先关闭目标软件，并在支持矩阵中补充版本、渠道、证据与验证日期。
