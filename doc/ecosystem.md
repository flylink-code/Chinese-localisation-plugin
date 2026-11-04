# 可适配软件与近期 GitHub 汉化仓库生态

调研与实测日期：2026年11月04日。

本软件作为**多软件 GitHub 汉化配置工作台**，不仅内置了 Claude Code、Claude Desktop、Antigravity 的多源预设，也在「+ 添加软件配置」中提供了 Cursor、Codex Desktop、Kiro IDE、OpenCode 等近期活跃 GitHub 汉化仓库的一键配置模板。汉化文本与脚本版权归各上游仓库作者所有。

---

## 1. 主页默认内置的 7 款 AI Agent 软件与预设源

用户在主页「软件工作台」直接可见以下 7 款常用 Agent 工具卡片（自动检测本机安装目录与版本号，支持一键点击「换源」切换预设或自定义仓库，也可在「+ 添加软件配置」中一键套用模板）：

### 1.1 Claude Code

| 仓库 | 许可证 | Star | 最近更新 | 入口与机制 | 集成方式 |
| --- | --- | ---: | --- | --- | --- |
| [jiangnanquan/claude-code-zh](https://github.com/jiangnanquan/claude-code-zh) | MIT | 4 | 2026-10-29 | `mods/cc-zh/.claude-plugin/plugin.json`（官方插件扩展点） | 默认源（内置兜底 + 在线同步） |
| [taekchef/claude-code-zh-cn](https://github.com/taekchef/claude-code-zh-cn) | MIT | 836 | 2026-11-04 | `plugin/.claude-plugin/plugin.json`（插件子目录） | 预设可一键切换；支持冲突自动接管 |

### 1.2 Claude Desktop

| 仓库 | 许可证 | Star | 最近更新 | 入口与机制 | 集成方式 |
| --- | --- | ---: | --- | --- | --- |
| [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn) | MIT | 8199 | 2026-11-03 | `scripts/install_windows.ps1`（UAC 提权注入 + 禁更新 + 技能同步） | 默认源（支持 `zh-CN`/`zh-TW`/`zh-HK` 与快捷配置按钮） |
| [Su-1003/claude-runtime-zh](https://github.com/Su-1003/claude-runtime-zh) | MIT | 1 | 2026-11-04 | `launch-zh.ps1`（免修改安装文件运行时注入，恢复参数 `-Restore`） | 预设可一键切换 |

### 1.3 Antigravity

| 仓库 | 许可证 | Star | 最近更新 | 入口与机制 | 集成方式 |
| --- | --- | ---: | --- | --- | --- |
| [Silas-02/antigravity-desktop-cn](https://github.com/Silas-02/antigravity-desktop-cn) | 未声明 | 177 | 2026-10-30 | `localization_engine.js`（支持 `--brand-title`、`--no-kill`、`--huifu`） | 默认源 |
| [qqxpee/antigravity2-cn](https://github.com/qqxpee/antigravity2-cn) | 未声明 | 1121 | 2026-11-04 | `localization_engine.js`（Antigravity 2.0 物理层动态注入，`--huifu` 还原） | 预设可一键切换（已实测拉取与解包） |
| [Souma-Sumire/antigravity-zh-cn](https://github.com/Souma-Sumire/antigravity-zh-cn) | MIT | 2 | 2026-11-04 | 安装 `install.js` / 恢复 `uninstall.js`（双入口脚本架构） | 预设可一键切换（已实测拉取与双入口校验） |
| [yuexps/Antigravity-Hans](https://github.com/yuexps/Antigravity-Hans) | 未声明 | 259 | 2026-10-26 | `localization_engine.js` | 预设可一键切换 |

---

## 2. 「+ 添加软件配置」内置一键模板（近期活跃 Agent 汉化仓库）

用户在主页点击 **「+ 添加软件配置」** 时，可直接点击以下模板自动填入仓库、分支、执行器、安装/恢复入口及 `{path}` 参数占位符：

### 2.1 Cursor IDE

| 仓库 | 许可证 | Star | 最近更新 | 执行器与入口 | 安装参数 / 恢复参数 | 本机实测结果（Cursor v3.27.22） |
| --- | --- | ---: | --- | --- | --- | --- |
| [lidefang0918/cursor-zh](https://github.com/lidefang0918/cursor-zh) | MIT | 4 | 2026-11-04 | `electron-node`<br>`scripts/run.mjs` | 安装：`localize --close --no-relaunch --offline --root={path}`<br>恢复：`revert --close --no-relaunch --root={path}` | 同步成功（`fb87d18d`），精确匹配本机 `F:\software\cursor` (`v3.27.22`, `supported: true, exact: true`) |
| [baishi1114010/cursor-i18n-zh](https://github.com/baishi1114010/cursor-i18n-zh) | MIT | 54 | 2026-11-04 | `electron-node`<br>`index.js` | 安装：`localize -p {path}`<br>恢复：`restore -p {path}` | 同步成功（`935df2c8`），本机 `status` 检测通过，隔离沙盒 `apply` → `uninstall` 字节级恢复验证通过 |

### 2.2 OpenAI Codex Desktop

| 仓库 | 许可证 | Star | 最近更新 | 执行器与入口 | 安装参数 / 恢复参数 | 本机实测结果（Codex v26.1027.6604.0） |
| --- | --- | ---: | --- | --- | --- | --- |
| [aimiliya825/codex-desktop-zh-cn](https://github.com/aimiliya825/codex-desktop-zh-cn) | MIT | 0 | 2026-10-30 | `powershell`<br>安装：`Install-CodexZh.ps1`<br>恢复：`Restore-CodexZh.ps1` | 安装：`-Yes -NoPause -LocaleOnly`<br>恢复：`-Yes -NoPause` | 同步成功（`39fad5cf`），MSIX 版本号 `26.1027.6604.0` 自动识别，双入口 `.ps1` 校验通过 |
| [shuai-liu001/codex-zh](https://github.com/shuai-liu001/codex-zh) | 未声明 | 1 | 2026-10-30 | `powershell`<br>`Install-CodexZH.ps1` | 生成独立中文便携版 `%LOCALAPPDATA%\CodexZH` | 已收录为便携版一键模板 |

### 2.3 Kiro IDE

| 仓库 | 许可证 | Star | 最近更新 | 执行器与入口 | 安装参数 / 恢复参数 | 本机实测结果（Kiro v1.4.26） |
| --- | --- | ---: | --- | --- | --- | --- |
| [polang233/kiro-language-pack](https://github.com/polang233/kiro-language-pack) | MIT | 4 | 2026-10-29 | `electron-node`<br>`bin/cli.mjs` | 安装：`install --locale=zh-cn --dir={path}`<br>恢复：`restore --dir={path}` | 同步成功（`705a43e2`），自动识别本机 `F:\software\Kiro` (`v1.4.26`) 并输出状态 |

### 2.4 OpenCode

| 仓库 | 许可证 | Star | 最近更新 | 执行器与入口 | 安装参数 / 恢复参数 | 本机实测结果 |
| --- | --- | ---: | --- | --- | --- | --- |
| [xlht4106/opencode-zh-hans](https://github.com/xlht4106/opencode-zh-hans) | MIT | 2 | 2026-10-19 | `electron-node`<br>`translate.js` | TUI 渲染层词典翻译插件 | 同步成功（`71ae52cd`），入口校验通过 |
