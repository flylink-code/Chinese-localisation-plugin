# 更新日志

本文件记录面向用户的版本变更。版本号与 GitHub Release 标签使用同一套语义化版本（`vX.Y.Z`）。

## 0.1.5 — 2026年11月04日

- 重构为「多软件 GitHub 汉化工作台」：每张软件卡片直接展示绑定的 GitHub 汉化仓库（支持一键「同步最新」、切换预设源或自定义 `owner/repo` 与分支）。
- 主页默认内置 **7 款常用 AI Agent 软件卡片并支持本机路径自动识别**：
  - **Claude Code**（`jiangnanquan/claude-code-zh`、`taekchef/claude-code-zh-cn`）
  - **Claude Desktop**（`javaht/claude-desktop-zh-cn`、`Su-1003/claude-runtime-zh`）
  - **Antigravity**（`Silas-02/antigravity-desktop-cn`、`qqxpee/antigravity2-cn`、`Souma-Sumire/antigravity-zh-cn`、`yuexps/Antigravity-Hans`）
  - **Cursor**（`lidefang0918/cursor-zh`、`baishi1114010/cursor-i18n-zh`、`481232534/cursor-zh-pack`）
  - **Codex Desktop**（`aimiliya825/codex-desktop-zh-cn`、`shuai-liu001/codex-zh`）
  - **Kiro IDE**（`polang233/kiro-language-pack` 简体/繁体）
  - **OpenCode**（`xlht4106/opencode-zh-hans`、`yuloop/OpenCodeChineseTranslationAuto`）
- 控制台命令与交互菜单全面可视化：
  - Claude Desktop 卡片内置语言切换（`zh-CN` / `zh-TW` / `zh-HK`）与一键快捷动作（`禁止自动更新`、`允许自动更新`、`同步 CC Switch 技能`、`取消技能同步`）。
  - Antigravity 卡片内置品牌标题选择（`--brand-title english|hidden`）与自动关闭运行中客户端开关，取消 `2.28.2` 版本硬编码限制，本机 `v2.27.0` 等任意版本均可直接汉化与恢复。
  - Claude Code 卡片内置冲突中文插件自动停用开关，并支持从 GitHub 同步最新插件。
- 取消说明书式强制预览弹窗：在卡片上点击「一键汉化」「重新汉化」「恢复原版」即刻执行并内联展示实时进度。
- 新增「+ 添加软件配置」功能：支持绑定任意本地软件目录与 GitHub 汉化仓库，生成可视化配置卡片；支持 `{path}` 路径占位符、独立恢复脚本（`uninstallEntry`）与免提权 PowerShell 脚本执行。

## 0.1.4 — 2026年11月04日

- Claude Desktop、Antigravity 新增「社区汉化源」：固定在具体提交并登记归档 SHA-256，确认后从 GitHub 下载、校验许可证与入口文件，再运行上游安装/卸载器；预览展示来源、提交、许可证、命令与风险。
- Claude Desktop 支持 UAC 提权安装/卸载（Windows，4.29+）：使用 `Start-Process -Verb RunAs -Wait`，传入原始用户 SID 与配置目录，保存退出码和日志；安装后检查补丁标记，未命中不记录为成功。
- Antigravity 社区源已接入但受版本限制：上游词典仅匹配 v2.28.2，其他版本明确说明原因、不下载不写入；安装要求用户先退出客户端，并以 `--no-kill` 运行上游引擎。
- 新增社区源状态与恢复：本软件安装后显示「已汉化（社区源）」并提供卸载；安装失败保留失败记录与日志，卸载后验证补丁标记消失才清除状态。
- 设置页新增「社区汉化源与致谢」，展示仓库、固定提交、许可证、兼容版本与归档哈希；新增社区源缓存与日志目录入口。
- Claude Desktop 检测不再把「只有备份、没有注入标记」误报为外部汉化；检测到多个安装实例时暂停写入，避免上游脚本作用于其他实例。
- Claude Code 支持接管外部中文插件：检测到已登记并启用的其他中文插件时显示「替换为内置汉化」，应用前停用该插件并在 `settings.json` 记录原值，卸载汉化时恢复；外部插件文件不会被删除。
- Claude Desktop、Antigravity 详情页新增「汉化支持说明」，说明可写入条件或无法写入的具体原因，并提供上游项目链接。
- Claude Desktop 检测新增随包中文词库检查：识别 `ion-dist.asar` / `ion-dist` 中是否包含 `i18n/zh-CN.json`，并在检测依据中显示结果。
- 设置页新增「内置汉化资源与致谢」，展示 cc-zh 的作者、来源、许可证与仓库链接，并明确本软件仅为整合工具。
- 新增 [doc/ecosystem.md](doc/ecosystem.md)：调研 Codex CLI、Gemini CLI、OpenCode、Cursor、Claude Desktop、Antigravity 等工具的汉化项目、许可证与接入建议。
- 内置插件来源说明补充版权归属与整合边界。

## 0.1.3 — 2026年11月04日

- 新增应用内更新：启动时自动检查（可在设置中关闭），发现新版本后由用户确认下载，再次确认后安装并重启；不在退出时静默安装。
- 新增 GitHub 镜像配置：版本信息与安装包下载都走自定义 HTTPS 镜像，下载使用更新元数据中的 sha512 校验。
- Windows NSIS 与 Linux AppImage 支持应用内下载安装；deb 与非 AppImage 环境提示手动安装。
- 发布工作流校验并上传 `latest.yml` / `latest-linux.yml`，缺少更新元数据时构建失败。

## 0.1.2 — 2026年11月04日

- 修复打开 Claude Desktop 详情时整个界面变黑：该适配器返回的检测结果缺少 `evidence` 字段，导致详情页渲染中断；现补齐该字段并新增回归测试。

## 0.1.1 — 2026年11月04日

- 新增 Ubuntu 22.04 支持：Claude Code CLI 检测、应用汉化与卸载汉化闭环；Claude Desktop deb 与 Antigravity Linux 安装路径检测。
- 新增 Windows NSIS、Ubuntu AppImage 与 deb 安装包（未签名）。
- 新增 GitHub Actions 标签构建：推送 `vX.Y.Z` 标签后自动构建并上传安装包。
- 修复 Linux 路径大小写比较与测试脚本跨平台问题。
- 已知限制：真实客户端中文界面尚未验证；Desktop / Antigravity 不提供写入；暂无自动更新与 macOS 支持。

## 0.1.0 — 2026年11月04日

首个可运行 MVP：

- 现代化桌面主页：三类软件安装检测、汉化状态、详情抽屉、搜索筛选、浅色/深色主题。
- Claude Code CLI：通过官方插件扩展点应用与卸载汉化，写前备份，只撤销本软件写入的改动。
- Claude Desktop、Antigravity：检测与汉化状态检查；暂不提供写入。
- 操作记录与本地设置。
- 设置页手动检查 GitHub Releases 更新；不自动下载或安装。
- 已知限制：真实客户端中文界面尚未验证；暂无安装包、自动更新、macOS / Linux 支持。
