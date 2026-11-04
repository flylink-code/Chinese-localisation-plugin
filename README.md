# 汉化管家 · 多软件 GitHub 汉化配置工作台

面向 Claude Code、Claude Desktop、Antigravity、Cursor、Codex Desktop、Kiro IDE、OpenCode 等常用 AI Agent 工具的可视化汉化配置桌面应用，支持 Windows 与 Ubuntu。主页自动检测本机已安装实例、绑定近期活跃 GitHub 汉化仓库，将繁琐的控制台命令与菜单转换为卡片上的可视化配置，点一下直接完成汉化或恢复原版。

> 当前版本为 `0.1.5`：主页默认内置 7 款主流 AI Agent 软件卡片（Claude Code、Claude Desktop、Antigravity、Cursor、Codex Desktop、Kiro、OpenCode）并支持多预设源切换、一键同步最新 GitHub 分支代码及「+ 添加软件配置」自定义扩展。支持的版本与生态清单见 [doc/ecosystem.md](doc/ecosystem.md) 与 [支持矩阵](doc/support-matrix.md)。

## 1. 已实现能力

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 现代化桌面主页 | 已实现 | 侧栏、搜索、筛选、软件卡片、详情抽屉、浅色/深色/跟随系统主题、键盘焦点 |
| Claude Code 检测 | 已实现 | CLI（`where`/`which`、npm 全局、原生安装、手动路径）与 VS Code / Cursor / Windsurf 扩展；Windows / Linux |
| Claude Desktop 检测 | 已实现 | Windows：`%LOCALAPPDATA%\AnthropicClaude\app-*` 与 MSIX；Linux：`/usr/lib/claude-desktop`（deb） |
| Antigravity 检测 | 已实现 | Windows 注册表与默认位置；Linux `~/.local/share`、`/opt`、`/usr/share`、Snap、Flatpak；手动路径 |
| 汉化状态检查 | 已实现 | 区分未汉化、本软件汉化、外部汉化、配置异常、中文资源待确认 |
| Claude Code 应用汉化 | 已实现 | 复制内置 `cc-zh` 插件到应用数据目录，合并用户级 `settings.json`，写前备份；检测到外部中文插件时先停用并记录；Windows / Linux |
| Claude Code 卸载汉化 | 已实现 | 只移除本软件写入的插件目录配置，保留其他插件和用户后续修改；恢复此前停用的外部插件 |
| 更新检查与安装 | 已实现 | 启动时自动检查（可关闭）；用户确认后下载并校验元数据哈希，再次确认后安装；支持 GitHub 镜像 |
| Claude Desktop 社区汉化 | 已实现，待实机验收 | 按需从 GitHub 下载固定提交（`javaht/claude-desktop-zh-cn`，MIT），校验归档 SHA-256 后运行上游安装器；需要 UAC 提权，会使签名失效；仅 Windows、Claude 4.29+ |
| Antigravity 社区汉化 | 受版本限制 | 已接入 `Silas-02/antigravity-desktop-cn`（上游未声明许可证），但词典仅匹配 v2.28.2；版本不符时不提供下载或写入 |
| 操作记录 | 已实现 | 记录应用/卸载结果，不保存配置内容或敏感信息 |
| Windows / Ubuntu 安装包 | 已实现 | NSIS `.exe`、AppImage、`.deb`；未签名，由 GitHub Actions 或本地构建 |
| 自动静默更新 | 未实现 | 下载与安装均需用户确认，退出时不自动安装 |

### 验证范围

- 已在 Windows 11 实机完成三类软件的真实只读检测（Claude Code CLI 2.1.316、Claude Desktop 4.4212.0、Antigravity 2.27.0）。
- 已在隔离用户目录完成 Claude Code「应用汉化 → 状态刷新 → 卸载汉化 → 原配置恢复」流程验证，未修改本机真实用户配置。
- 已在 WSL Ubuntu 22.04 的隔离 HOME 中验证 Linux 检测路径及 Claude Code 应用/卸载闭环；AppImage 与 deb 在 WSL 中构建成功。
- 已验证社区汉化源链路：从 codeload 下载固定提交归档、SHA-256 与许可证/入口文件校验、解压到应用数据目录、生成 UAC 提权启动脚本；上游脚本的安装/卸载执行与真实界面效果尚未验收。
- 已验证更新链路：`0.1.3` 打包应用通过 GitHub 官方源检查并显示已是最新；配置本地 HTTPS 镜像后可检查到模拟新版本、下载并完成 sha512 校验，设置页「已下载」状态截图核对通过。真实安装包覆盖安装与重启、AppImage 自动替换尚未验证。
- **尚未验证** Claude Code 启动后的中文界面效果、真实用户默认配置下的应用、Claude Desktop 的真实 UAC 提权安装与卸载、Antigravity 写入、安装包在干净 Windows / Ubuntu 机器上的安装与启动、macOS 支持。

## 2. 快速开始

### 安装包

从 [GitHub Releases](https://github.com/flylink-code/Chinese-localisation-plugin/releases) 下载：

- Windows：`ChineseLocaliser-0.1.5-windows-x64.exe`（NSIS 安装包）。
- Ubuntu：`ChineseLocaliser-0.1.5-linux-x86_64.AppImage` 或 `ChineseLocaliser-0.1.5-linux-amd64.deb`。

安装包未签名：Windows SmartScreen 与部分 Linux 桌面环境会提示来源未知，请自行核对 Release 页面与文件哈希。Ubuntu 22.04 运行 AppImage 需要 `libfuse2`；AppImage 桌面入口使用 `--no-sandbox`（Electron AppImage 的启动限制），需要完整 Chromium 沙箱时请使用 deb。安装包内置构建时同版本的 `cc-zh` 插件。

### 源码运行

环境：Windows 10/11 或 Ubuntu 22.04+、Node.js 20+（开发使用 Node 24）。

```bash
cd app
npm install
npm run build
npm start
```

其他命令：

```bash
npm test          # 核心检测/备份/恢复单元测试
npm run typecheck # TypeScript 类型检查
npm run dev       # 构建后启动
npm run dist:win  # 构建 Windows NSIS 安装包
npm run dist:linux# 构建 AppImage 与 deb（需在 Linux 上执行）
```

首次启动会自动检测三类软件；也可点击「重新检测」。Windows 数据保存在 `%APPDATA%\chinese-localiser`，Linux 保存在 `~/.config/chinese-localiser`。

若终端环境设置了 `ELECTRON_RUN_AS_NODE=1`，Electron 会以 Node 模式运行并报 `app.whenReady` 错误，启动前需取消该变量：

```bash
env -u ELECTRON_RUN_AS_NODE npm start
```

### 版本与发布

- `app/package.json` 的 `version` 是唯一版本来源，界面与更新检查均读取该值。
- 发布步骤：更新版本号与 [CHANGELOG.md](CHANGELOG.md) → 提交 → 创建 `vX.Y.Z` 标签 → 在 GitHub 创建同名 Release。
- 设置页「检查更新」读取最新版本；「下载更新」下载并校验更新元数据中的 sha512；「安装并重启」由用户确认后执行，退出时不自动安装。
- 支持自定义 GitHub 镜像：镜像需同时提供 `latest.yml`（Linux 为 `latest-linux.yml`）与安装包，版本信息与下载都走镜像；镜像可以替换更新内容，只应填写可信地址。
- 发布工作流会校验 `latest.yml` / `latest-linux.yml` 并随安装包上传；缺少元数据时构建失败。
- 版本为 `0.1.3`，提供 Windows 与 Ubuntu 安装包；推送 `vX.Y.Z` 标签时由 [GitHub Actions](.github/workflows/build-installers.yml) 构建并上传安装包。

## 3. 使用流程与状态

1. 主页显示已安装软件；「全部目录」可查看未安装项，未发现时提供手动指定安装路径。
2. 详情抽屉展示安装实例、版本、渠道、完整路径和检测依据。
3. 汉化状态独立于安装状态：已安装不等于已汉化，检测到备份也不等于汉化生效。
4. Claude Code 可操作实例会在预览中列出插件复制、`settings.json` 变更、备份位置、覆盖范围和注意事项；确认后才写入。
5. 「卸载汉化」只撤销本软件可校验的改动，保留历史备份和用户其他设置。
6. 检测到其他来源的中文插件时显示「替换为内置汉化」：应用前停用该插件并记录原值，卸载汉化时恢复；外部插件文件不会被删除。
7. Claude Desktop 在版本满足要求时显示「下载并安装社区汉化」：预览列出上游仓库、固定提交、许可证、归档 SHA-256、将执行的下载与脚本、UAC 提权与签名失效等风险；确认后下载并校验归档、运行上游安装器。卸载汉化会调用同一来源的卸载器并从上游备份恢复。
8. Antigravity 只有在版本与上游词典完全匹配时才提供该入口；版本不符时明确说明原因，不下载、不写入。

| 状态 | 含义 | 主操作 |
| --- | --- | --- |
| 未汉化 | 未检测到有效汉化证据 | 适配通过时显示「应用汉化」 |
| 已汉化 | 本软件插件有效且配置完整 | 「卸载汉化」 |
| 外部汉化 | 检测到其他来源的中文插件/补丁 | 「替换为内置汉化」；先停用外部插件并记录，卸载时恢复 |
| 配置异常 | 有安装记录但插件或配置不完整 | 可尝试卸载残留 |
| 中文资源待确认 | 存在中文资源，无法确认来源或生效状态 | 仅查看 |
| 检测失败 | 检测过程报错 | 查看原因后重试，不伪装成未安装 |

## 4. 支持矩阵

| 工具 | 平台 | 安装检测 | 汉化状态 | 应用汉化 | 卸载汉化 |
| --- | --- | --- | --- | --- | --- |
| Claude Code CLI | Windows / Ubuntu | 支持 | 支持 | 支持（官方插件扩展点） | 支持 |
| Claude Code IDE 扩展 | Windows / Ubuntu | 支持 | 仅说明 CLI 插件不影响扩展 | 不支持 | 不支持 |
| Claude Desktop | Windows / Ubuntu | 支持 | 支持 | 支持（Windows 社区源，需 UAC，未实机验收） | 支持（同一来源卸载器） |
| Antigravity | Windows / Ubuntu | 支持 | 支持 | 受版本限制（仅 Windows、v2.28.2） | 仅本软件安装后可用 |

详细版本、证据和限制见 [doc/support-matrix.md](doc/support-matrix.md)。参考项目位于 [example/](example/)，仅用于研究，不由应用执行。

## 5. 架构与目录

```text
app/
├── electron/
│   ├── main.cjs                  主进程：窗口、IPC、权限边界
│   ├── preload.cjs               受限 API 桥
│   ├── core/
│   │   ├── adapters/             三工具检测与状态检查
│   │   ├── localization/         Claude Code 插件应用/卸载与备份
│   │   ├── external-catalog.cjs  社区汉化源登记：仓库、固定提交、SHA-256、许可证、版本范围
│   │   ├── external-sources.cjs  社区源下载、校验、解压、安装/卸载编排
│   │   ├── source-runner.cjs     UAC 提权启动与 Electron Node 执行
│   │   ├── scan.cjs              并行检测编排、超时与取消
│   │   ├── store.cjs             配置、安装状态、操作记录
│   │   ├── update-service.cjs    electron-updater 检查、下载与安装服务
│   │   ├── updates.cjs           镜像校验与更新源配置
│   │   └── util.cjs              文件哈希、原子写入、ASAR 读取、命令执行
│   └── test/                     单元与隔离集成测试
├── src/                          React 管理界面
├── scripts/sync-bundled-plugin.cjs
├── build/                        安装包图标与生成脚本
├── vendor/cc-zh/                 内附插件源码及 MIT 许可证
└── resources/plugins/cc-zh/      构建时同步的内置插件（已忽略）
.github/workflows/                标签构建 Windows / Ubuntu 安装包
example/                          参考项目（只读研究）
doc/                              任务计划与支持矩阵
```

设计要点：

- 渲染进程无 Node 权限；所有检测与写入经 preload 暴露的受限 API 进入主进程。
- 检测并行执行，单项失败不影响其他软件；检测为只读，不执行参考安装脚本。
- 应用汉化前校验内置插件、实例版本和 `settings.json`；备份失败即停止。
- 写配置使用临时文件 + 原子替换；`settings.json` 无法解析时拒绝修改。
- Electron 会把 `.asar` 当作虚拟目录，读取真实归档时临时设置 `process.noAsar`（引用计数），避免并行检测互相干扰。
- 社区源归档解压前校验 SHA-256，解压时拒绝绝对路径、目录穿越与链接条目；许可证或入口文件缺失即停止。
- 卸载只移除本软件记录的插件目录，不整份恢复旧备份，防止覆盖用户之后的修改。

## 6. 第三方汉化资源与致谢

本软件是整合工具：只负责检测、安装、卸载和状态校验，不拥有汉化文本的版权。当前内置资源：

| 资源 | 作者 | 来源 | 许可证 | 使用方式 |
| --- | --- | --- | --- | --- |
| cc-zh 0.1.0 | jnq | [jiangnanquan/claude-code-zh](https://github.com/jiangnanquan/claude-code-zh) | MIT | 通过 Claude Code 官方插件扩展点安装与卸载 |
| Claude Desktop 社区汉化 | javaht | [javaht/claude-desktop-zh-cn](https://github.com/javaht/claude-desktop-zh-cn) | MIT | 固定提交 `444414d`，按需下载并运行上游安装/卸载器 |
| Antigravity 社区汉化 | Silas-02 | [Silas-02/antigravity-desktop-cn](https://github.com/Silas-02/antigravity-desktop-cn) | 未声明 | 固定提交 `bd9d60a`，运行时下载，不内置、不再分发 |

- 设置页「内置汉化资源与致谢」展示作者、来源和许可证，并提供仓库链接。
- 插件源码与许可证随应用分发，见 `app/vendor/cc-zh/` 与 `app/resources/plugins/cc-zh/THIRD_PARTY.md`。
- 本软件不修改插件内容，不重新分发 Claude Code、Claude Desktop、Antigravity 本体。

可适配软件与各汉化项目的维护状态、许可证和接入建议见 [doc/ecosystem.md](doc/ecosystem.md)。调研中的项目不代表已经支持；未确认许可证的项目不会被内置或重新分发，社区源仅在用户确认后从上游仓库下载到本机。

## 7. 安全与隐私

- 只修改用户可见文案，不翻译 JSON key、枚举、环境变量、工具名、命令名、路径、API 字段或协议标识。
- 不主动强制结束目标进程，不修改运行中的可执行文件，不绕过签名或系统保护。Antigravity 安装前要求用户退出并使用 `--no-kill`；Claude Desktop 上游安装器会关闭客户端进程，预览中明确提示。
- 社区汉化源固定在具体提交并校验归档 SHA-256；预览展示来源、许可证、命令与风险，用户确认后才下载并运行上游安装器。哈希只能证明内容与登记值一致，不等同于作者签名。
- 默认不自动提权。唯一例外是 Windows 上 Claude Desktop 的社区源安装/卸载：仅在用户确认后通过 UAC 提权，使用 `Start-Process -Verb RunAs -Wait` 并保存退出码与日志。
- 不将社区源归档内置或重新分发；无许可证项目只登记来源与固定提交，运行时按用户确认下载。上游脚本对目标软件的改动由上游管理，本软件只验证补丁标记并提供卸载入口。
- 只写入应用数据目录与明确的 Claude Code 用户配置；社区源解压到 `%APPDATA%\chinese-localiser\sources`（Linux 为 `~/.config/chinese-localiser/sources`），日志写入同目录下的 `logs`。
- 外部汉化在登记来源可识别且 CLI 版本满足要求时提供接管：停用外部插件并写入 `enabledPlugins`，记录原值；卸载时只恢复仍由本软件停用的条目，不覆盖用户之后的修改。插件文件与外部插件已对程序文件做过的修改不在恢复范围内。
- 不提交 token、API key、账号配置、真实会话、目标软件私有资源或含个人信息的日志。
- 默认离线可用；仅在启动自动检查、点击「检查更新」、下载更新，或用户确认安装社区汉化时发起网络请求。社区汉化请求发送到 `codeload.github.com`，不上传本机安装信息，不引入在线翻译或遥测。
- 不重新分发 Claude Code、Claude Desktop、Antigravity 本体；内置插件的 MIT 许可与来源见 `app/resources/plugins/cc-zh/THIRD_PARTY.md`。本项目与相关厂商无隶属关系。

## 8. 已知限制

- Claude Code 汉化只覆盖插件已接线的部分终端文案；权限确认对话框、欢迎屏、错误信息、`claude --help` 等仍为英文。
- 本机已安装其他中文插件时会识别为「外部汉化」；可显式替换为内置汉化，替换时停用外部插件并记录原值，卸载汉化时恢复。外部插件文件不会被删除，它已对 Claude Code 程序文件做过的修改本软件也不会撤销。
- Claude Desktop 的 MSIX 安装位于 `WindowsApps`，目录由 TrustedInstaller 控制且实测不可写；社区源安装会接管目录所有权、改写 ASAR 并使签名失效，且不会自动恢复所有权，卸载后 `English` 界面也可能需要重新启动才恢复。该流程尚未在真实机器上完成 UAC 提权验收。
- Antigravity 桌面版没有官方语言设置或中文词库，界面由本地语言服务提供的 Web 资源与 Electron 原生菜单组成；上游汉化项目未声明许可证，且词典仅匹配 v2.28.2。本机 v2.27.0 不提供下载或写入，需先升级 Antigravity 或等待上游更新。
- 社区源哈希只能证明归档与登记值一致，不能证明作者身份或后续安全性；上游脚本会直接修改目标软件，失败时需根据日志人工确认。
- Windows 与 Ubuntu 安装包均未签名，不能证明来源；请以 Release 页面和哈希为准。
- 更新下载只校验更新元数据中的文件哈希，安装包未签名，不能证明来源；镜像可替换更新内容，仅应配置可信地址。
- 尚未验证真实安装包的自动覆盖安装与重启、AppImage 自动替换、macOS 验证和界面视觉回归测试。

## 9. 参与开发

- 开发约定：[AGENTS.md](AGENTS.md)
- 任务、依赖与验收：[doc/task.md](doc/task.md)
- 支持矩阵：[doc/support-matrix.md](doc/support-matrix.md)
- 英文入口：[README_en.md](README_en.md)
