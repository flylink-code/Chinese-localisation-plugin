# 汉化管家 · 多工具中文本地化管理软件

面向 Claude Code、Claude Desktop、Antigravity 等工具的本地化管理桌面应用，支持 Windows 与 Ubuntu。主页检测本机已安装实例、展示汉化状态，并按适配能力提供应用汉化与卸载汉化（恢复原文，不卸载目标软件）。

> 当前为可运行 MVP：三类软件的真实安装检测、汉化状态检查已接入；Claude Code CLI 通过官方插件扩展点完成应用与卸载汉化闭环；Claude Desktop、Antigravity 目前仅支持检测与状态查看。已发布 0.1.3，包含 Windows 与 Ubuntu 安装包。支持的版本与验证范围见 [支持矩阵](doc/support-matrix.md)。

## 1. 已实现能力

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| 现代化桌面主页 | 已实现 | 侧栏、搜索、筛选、软件卡片、详情抽屉、浅色/深色/跟随系统主题、键盘焦点 |
| Claude Code 检测 | 已实现 | CLI（`where`/`which`、npm 全局、原生安装、手动路径）与 VS Code / Cursor / Windsurf 扩展；Windows / Linux |
| Claude Desktop 检测 | 已实现 | Windows：`%LOCALAPPDATA%\AnthropicClaude\app-*` 与 MSIX；Linux：`/usr/lib/claude-desktop`（deb） |
| Antigravity 检测 | 已实现 | Windows 注册表与默认位置；Linux `~/.local/share`、`/opt`、`/usr/share`、Snap、Flatpak；手动路径 |
| 汉化状态检查 | 已实现 | 区分未汉化、本软件汉化、外部汉化、配置异常、中文资源待确认 |
| Claude Code 应用汉化 | 已实现 | 复制内置 `cc-zh` 插件到应用数据目录，合并用户级 `settings.json`，写前备份；Windows / Linux |
| Claude Code 卸载汉化 | 已实现 | 只移除本软件写入的插件目录配置，保留其他插件和用户后续修改 |
| 更新检查与安装 | 已实现 | 启动时自动检查（可关闭）；用户确认后下载并校验元数据哈希，再次确认后安装；支持 GitHub 镜像 |
| 操作记录 | 已实现 | 记录应用/卸载结果，不保存配置内容或敏感信息 |
| Windows / Ubuntu 安装包 | 已实现 | NSIS `.exe`、AppImage、`.deb`；未签名，由 GitHub Actions 或本地构建 |
| Desktop / Antigravity 汉化写入 | 未实现 | 仅检测；不调用参考项目安装脚本，避免签名、权限和升级回滚风险 |
| 自动静默更新 | 未实现 | 下载与安装均需用户确认，退出时不自动安装 |

### 验证范围

- 已在 Windows 11 实机完成三类软件的真实只读检测（Claude Code CLI 2.1.316、Claude Desktop 4.4212.0、Antigravity 2.27.0）。
- 已在隔离用户目录完成 Claude Code「应用汉化 → 状态刷新 → 卸载汉化 → 原配置恢复」流程验证，未修改本机真实用户配置。
- 已在 WSL Ubuntu 22.04 的隔离 HOME 中验证 Linux 检测路径及 Claude Code 应用/卸载闭环；AppImage 与 deb 在 WSL 中构建成功。
- 已验证更新链路（`0.1.2` 打包应用 + 本地 HTTPS 镜像）：保存镜像地址、检查到新版本、下载并完成 sha512 校验，设置页「已下载」状态截图核对通过；GitHub 官方源路径已确认会读取 Release 的 `latest.yml`。真实安装包覆盖安装与重启、AppImage 自动替换尚未验证。
- **尚未验证** Claude Code 启动后的中文界面效果、真实用户默认配置下的应用、Desktop / Antigravity 写入、安装包在干净 Windows / Ubuntu 机器上的安装与启动、macOS 支持。

## 2. 快速开始

### 安装包

从 [GitHub Releases](https://github.com/flylink-code/Chinese-localisation-plugin/releases) 下载：

- Windows：`ChineseLocaliser-0.1.3-windows-x64.exe`（NSIS 安装包）。
- Ubuntu：`ChineseLocaliser-0.1.3-linux-x86_64.AppImage` 或 `ChineseLocaliser-0.1.3-linux-amd64.deb`。

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

| 状态 | 含义 | 主操作 |
| --- | --- | --- |
| 未汉化 | 未检测到有效汉化证据 | 适配通过时显示「应用汉化」 |
| 已汉化 | 本软件插件有效且配置完整 | 「卸载汉化」 |
| 外部汉化 | 检测到其他来源的中文插件/补丁 | 仅查看，避免覆盖 |
| 配置异常 | 有安装记录但插件或配置不完整 | 可尝试卸载残留 |
| 中文资源待确认 | 存在中文资源，无法确认来源或生效状态 | 仅查看 |
| 检测失败 | 检测过程报错 | 查看原因后重试，不伪装成未安装 |

## 4. 支持矩阵

| 工具 | 平台 | 安装检测 | 汉化状态 | 应用汉化 | 卸载汉化 |
| --- | --- | --- | --- | --- | --- |
| Claude Code CLI | Windows / Ubuntu | 支持 | 支持 | 支持（官方插件扩展点） | 支持 |
| Claude Code IDE 扩展 | Windows / Ubuntu | 支持 | 仅说明 CLI 插件不影响扩展 | 不支持 | 不支持 |
| Claude Desktop | Windows / Ubuntu | 支持 | 支持 | 不支持 | 不支持 |
| Antigravity | Windows / Ubuntu | 支持 | 支持 | 不支持 | 不支持 |

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
│   │   ├── scan.cjs              并行检测编排、超时与取消
│   │   ├── store.cjs             配置、安装状态、操作记录
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
- 卸载只移除本软件记录的插件目录，不整份恢复旧备份，防止覆盖用户之后的修改。

## 6. 安全与隐私

- 只修改用户可见文案，不翻译 JSON key、枚举、环境变量、工具名、命令名、路径、API 字段或协议标识。
- 不修改运行中的可执行文件，不强制结束进程，不自动提权，不绕过签名或系统完整性保护。
- 只写入应用数据目录与明确的 Claude Code 用户配置；汉化插件来源固定为仓库内置资源。
- 外部汉化、未知版本、配置无法解析、备份缺失时不提供风险写入入口。
- 不提交 token、API key、账号配置、真实会话、目标软件私有资源或含个人信息的日志。
- 默认离线可用；仅在启动自动检查或点击「检查更新」时请求版本信息，下载更新时请求安装包；配置镜像后这些请求发送到该镜像，不上传本机数据，不引入在线翻译或遥测。
- 不重新分发 Claude Code、Claude Desktop、Antigravity 本体；内置插件的 MIT 许可与来源见 `app/resources/plugins/cc-zh/THIRD_PARTY.md`。本项目与相关厂商无隶属关系。

## 7. 已知限制

- Claude Code 汉化只覆盖插件已接线的部分终端文案；权限确认对话框、欢迎屏、错误信息、`claude --help` 等仍为英文。
- 本机已安装其他中文插件时会识别为「外部汉化」并阻止本软件写入，需用户自行决定是否移除旧插件。
- Claude Desktop 的 MSIX 安装受系统完整性保护，只能保证检测范围；Linux deb 版补丁需 sudo 修改系统目录，本软件不自动提权，因此不提供写入。
- Antigravity 仅识别 `app.asar` 注入标记与备份；Linux 版同样未接入 ASAR 注入写入。
- Windows 与 Ubuntu 安装包均未签名，不能证明来源；请以 Release 页面和哈希为准。
- 更新下载只校验更新元数据中的文件哈希，安装包未签名，不能证明来源；镜像可替换更新内容，仅应配置可信地址。
- 尚未验证真实安装包的自动覆盖安装与重启、AppImage 自动替换、macOS 验证和界面视觉回归测试。

## 8. 参与开发

- 开发约定：[AGENTS.md](AGENTS.md)
- 任务、依赖与验收：[doc/task.md](doc/task.md)
- 支持矩阵：[doc/support-matrix.md](doc/support-matrix.md)
- 英文入口：[README_en.md](README_en.md)
