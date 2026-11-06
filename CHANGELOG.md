# 更新日志

本文件记录面向用户的版本变更。版本号唯一来源为 `app/package.json`，构建产物按版本保存到仓库根目录 `dist/`，不再发布 GitHub Release。

## 0.1.0 — 2026年11月06日

首个本地构建版本，构建产物保存在根目录 `dist/`。

- 多软件 GitHub 汉化工作台：每张软件卡片直接展示绑定的 GitHub 汉化仓库，支持一键「同步最新」、切换预设源或自定义 `owner/repo` 与分支。
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
  - Antigravity 卡片内置品牌标题选择（`--brand-title english|hidden`）与自动关闭运行中客户端开关，不锁定客户端版本。
  - Claude Code 卡片内置冲突中文插件自动停用开关，并支持从 GitHub 同步最新插件。
- 取消说明书式强制预览弹窗：在卡片上点击「一键汉化」「重新汉化」「恢复原版」即刻执行并内联展示实时进度。
- 「+ 添加软件配置」支持绑定任意本地软件目录与 GitHub 汉化仓库，支持 `{path}` 路径占位符、独立恢复脚本（`uninstallEntry`）与免提权 PowerShell 脚本执行。
- Claude Code 通过官方插件扩展点应用与卸载汉化；Claude Desktop、Antigravity 及自定义软件在用户确认后从登记的 GitHub 仓库下载并运行上游安装/卸载脚本；Windows 上 Claude Desktop 的社区源操作经 UAC 提权执行。
