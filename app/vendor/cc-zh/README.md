# cc-zh — Claude Code 简体中文 UI mod（0.1.0）

[![Validates on](https://raw.githubusercontent.com/karanb192/awesome-claude-code-mods/main/badges/jiangnanquan--claude-code-zh--cc-zh-validates.svg)](https://mods.aidojo.si/#jiangnanquan--claude-code-zh--cc-zh)
[![Reach](https://raw.githubusercontent.com/karanb192/awesome-claude-code-mods/main/badges/jiangnanquan--claude-code-zh--cc-zh-reach.svg)](https://mods.aidojo.si/#jiangnanquan--claude-code-zh--cc-zh)
[![Mentioned in Awesome Claude Code Mods](https://awesome.re/mentioned-badge.svg)](https://github.com/karanb192/awesome-claude-code-mods)
[![Catalogue](https://img.shields.io/badge/catalogue-mods.aidojo.si-3B82F6?logo=anthropic)](https://mods.aidojo.si/#jiangnanquan--claude-code-zh--cc-zh)
[![Featured in Community Mods](https://img.shields.io/badge/community_mods-hamzafer-orange?logo=github)](https://github.com/hamzafer/claude-code-mods#--community-mods)
[![Claude Code](https://img.shields.io/badge/Claude_Code-%E2%89%A52.1.287-blue)](https://github.com/jiangnanquan/claude-code-zh)
[![Tests](https://img.shields.io/badge/tests-11%20pass-success)](https://github.com/jiangnanquan/claude-code-zh)
[![Token Cost](https://img.shields.io/badge/token_cost-0-brightgreen)](https://github.com/jiangnanquan/claude-code-zh)
[![Network](https://img.shields.io/badge/network-zero-blue)](https://github.com/jiangnanquan/claude-code-zh)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/jiangnanquan/claude-code-zh/blob/main/LICENSE)

> **B 线**：2.1.287+ 的官方扩展点（mods）。**不碰官方产物**——不改二进制、不改字节码；
> 失效时退回英文原文，不会把 CLI 改崩。零 token、零网络。

本项目前身是二进制补丁路线（A 线），因官方 2.1.24x bytecode 化已清退；其翻译表资产
已并入本插件的 `dict.json`，旧文件与过程保留在仓库 Git 历史中。

## 当前实测状态（CC 2.1.296，2026-10-12）

| 项 | 值 |
| :--- | :--- |
| 词典 | `exact` **2010** 条 · `patterns` **4** 条 · `spinner` 5 条 · `modes` **空**（见下） |
| `/cc-zh-dump` | **命令 0，配置 0，屏幕文案 0** —— 本轮采集到的未译项已全部补齐 |
| 装配校验 | `claude plugin validate .` → Validation passed（13 钩子 + 8 个 `$` 调用） |
| 运行时测试 | `claude plugin test .` → **11 pass / 0 fail** |
| 排版实机验证 | 100 列 × 300 行快照：**溢出 0 行**；长中文描述正常折行 |
| UTF-8 完整性 | 解码替换字符 **0**（探针自身缺陷已排除，见 `tools/README.md`） |

`modes`（页脚模式标签）**确认为空是终态**：采样显示 `SessionMode.props.modes` 恒为 `[]`，
页脚的 `auto mode on` 是引擎独占绘制的 pill，按设计不可汉化。

## 它做什么

以**静态词典**把下列界面显示为中文。全部走「props 透传改写」——由引擎用自己的组件绘制，
因此布局、配色、键位、交互一律不变。

| # | 界面 | 实现钩子 | 状态 |
| :-- | :--- | :--- | :--- |
| 1 | `/` 弹出的**斜杠命令说明**（内置命令、skills、插件） | `command.describe` | 已实现（含 `patterns` 兜底） |
| 2 | **`/config` 行**的 label 与说明 | `config.describe` | 已实现 |
| 3 | 工作态 **Spinner** 词与附带文案 | `ui.render` `Spinner` | 已实现（仅 terminal surface；**只在仍为英文时接替**，见下） |
| 4 | **提示行**（整句译到才替换） | `ui.render` `PromptHint` | 已实现 |
| 5 | **通知条** | `ui.render` `InfoNotice` | 已实现 |
| 6 | **页脚模式标签** | `ui.render` `SessionMode` | 已接线；`modes` 恒空，无对象可填 |
| 7 | `(ctrl+b to run in background)` | `ui.render` `ToolProgress` | 已实现 |
| 8 | **命令输出行** | `ui.render` `CommandOutput` | 已实现（仅精确命中/正则，不猜） |
| 9 | **后台任务通知** | `ui.render` `UserMessage`{origin=task-notification} | 已实现 |
| 10 | **折叠的工具调用摘要**（`Read 3 files`） | `ui.render` `ToolGroup` | 已实现（自绘） |
| 11 | **轮次结束行**（`Baked for 3s`） | `ui.render` `TurnDuration` | 已实现（自绘，中文时长） |

### ⚠️ 不要覆盖用户已配好的官方中文

`settings.json` 已提供若干**官方**本地化开关，本 mod 必须让路：

| 官方设置 | 作用 | 本 mod 的纪律 |
| :--- | :--- | :--- |
| `spinnerVerbs` | 自定义 Spinner 动词（用户已配「烘焙中」「焯水ing」等） | **只在 `props.word` 仍为英文时**才接替；含中文一律原样放行 |
| `spinnerTipsOverride` | 自定义 tips 文本 | 本 mod 不碰 tips（不在覆盖范围内） |
| `language` | 官方语言偏好 | 与本 mod 正交，不冲突 |

> **这不是纸面顾虑**：2.1.296 实测 `Spinner.props.word` 就是用户 `spinnerVerbs` 里的随机中文词
> （如「哈希中」「联网中」）。早期版本无条件用固定词表覆盖，会把它换成「应答中」——
> 属体验退化。现由 `spinnerWord()` 负责判定，`tests/register.test.ts` 有回归用例。

### 未接线的渲染点（**覆盖面缺口，非官方限制**）

`ui.render` 共 15 个渲染点，本 mod 目前钩了 **9** 个：

| 已钩 | 未钩 |
| :--- | :--- |
| Spinner · PromptHint · InfoNotice · SessionMode · ToolProgress · CommandOutput · UserMessage(task-notification) · ToolGroup · TurnDuration | **AssistantMessage · ToolUse · ToolResult · AskUserQuestion · AbovePrompt · Pane** |

未钩的这几处仍会显示英文，实测可见的有：

- `Thought for 1s (ctrl+o to expand)` —— 思考块标题（属 `AssistantMessage`）
- `(0s · thinking with max effort)` —— Spinner 附注，**不在** `props.message` 里
  （实测 `message` 为 `null`），故现有 Spinner 钩子取不到

> `ToolUse.tool` 按官方声明是**可写**字段（`Bash`/`Read` 这类标签可汉化），但 `ToolResult.tool` 是**只读**的
> —— 两者不对称。是否要汉化工具名本身，属产品判断，**未做**。

### 不可汉化（官方设计，非本 mod 缺陷）

`mods` 的 `ui.render` 只覆盖 15 个渲染点，且**权限确认对话框由引擎独占绘制**
（官方注释：*"The permission dialog is drawn by the engine alone, since its answer authorises an action"*）。
以下均为覆盖范围外：

- 权限确认窗口 · 欢迎屏幕 · `/config`、`/model` 的**子选择屏**与选项值（`auto`/`dark`/`plan`）
- 错误信息 · tips · 提示行下方的 pills（`auto mode on`）
- 工具调用行本身（`Bash(ls)`、`Interrupted`）与运行中的 `(12s, 300 tokens)`
- `claude --help`（CLI 参数层输出，非会话内渲染）

## 设计要点：以「引擎英文原文」为键

与社区先例 `ko-ui`（韩文）的关键差异——**不需要按命令名/配置键枚举**：

```
引擎的英文描述  ──(command.describe 的 next(e) 返回)──►  查 dict.json 的 exact 表  ──►  中文
                                                            ↓ 未命中
                                                         patterns 正则兜底
```

好处：

1. 历史翻译表（1905 条，源自 claude-code-zh-cn，MIT）已**一次性吸收**为 `dict.json` 的 `exact` 底子，无需重编结构；
2. 版本升级把英文改了 ⇒ 只是「命不中、放行原文」，**不会译错**；
3. 未命中的字符串由 **`/cc-zh-dump`** 汇总 ⇒ 词典增量攒，不靠猜。

`dict.json` 是**唯一词典**，不再自动跟随上游翻译表；上游若有值得吸收的新词，人工甄别后补入。

### `patterns`：静态表结构性覆盖不到的那一类

带**运行时变量**的描述无法进 `exact`（每次值都不同），改走 `patterns` 正则：

| 命令 | 引擎原文形态 | 正则 |
| :--- | :--- | :--- |
| `/model` | `Set the AI model for Claude Code (currently <模型名>)` | `^Set the AI model for Claude Code \(currently (.+)\)$` |
| `/fast` | `Toggle fast mode (<模式>)` | `^Toggle fast mode \((.+)\)$` |
| `/sandbox` | `◯ sandbox disabled (⏎ to configure)` | `^◯ sandbox disabled \(⏎ to configure\)$` |

> ⚠️ `command.describe` 走的是 `trDesc()`（`exact` → `patterns`），与早期的裸 `exact` 查表不同。
> 若 `patterns` 突然不生效，先确认 `trDesc` 还在（`tests/register.test.ts` 有回归用例）。

## 目录

```
mods/cc-zh/
├── .claude-plugin/plugin.json   清单（types/ 由 CLI 生成，已 gitignore）
├── hooks/hooks.json             指向 ./register.tsx
├── hooks/register.tsx           全部 13 个钩子（含 /cc-zh-dump）
├── dict.json                    词典：exact(2010) + spinner + modes + patterns(4)
├── tests/register.test.ts       11 项运行时测试
└── tools/                       验收与采样工具（非发布物）
    ├── tty-probe.py             TTY 排版验收（可复算证据）
    ├── runtime-sampler/         取权威英文原文的采样插件
    └── README.md                ← 补词条/验收前**必读**
```

## 用法

### 日常使用：已装进全局配置（2026-10-12 起）

```jsonc
// ~/.claude/settings.json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "/Users/jnq/Dev/Private/claude-code-zh/mods/cc-zh"
}
```

`CLAUDE_CODE_PLUGIN_DIRS` 是官方支持的变量，CLI 启动时按 `--plugin-dir` 的同一条路径**内联加载**
（二进制内记作 `preAction: CLAUDE_CODE_PLUGIN_DIRS inline plugins`）。
⇒ 直接敲 `claude` 即带汉化；**仓库里改完立即生效，无需重装**。删掉这一行即完全还原。

> 与 `--plugin-dir` 的差别只在生命周期：命令行参数是 **session-only**，变量是每次启动都读。
> 两者都已实测生效（2026-10-12，CC 2.1.296）。

### 单会话试装（改配置前先验证、或做 A/B 对比）

```bash
claude --plugin-dir /Users/jnq/Dev/Private/claude-code-zh/mods/cc-zh

# 会话内：列出词典里还没有中文的命令/配置项/屏幕文案
/cc-zh-dump

# 校验与测试
claude plugin validate .
claude plugin test .
```

> 尚未发布到 Anthropic 官方目录；本仓自带 marketplace，可直接：
> `/plugin install cc-zh --marketplace jiangnanquan/claude-code-zh`（或先
> `claude plugin marketplace add jiangnanquan/claude-code-zh` 再
> `claude plugin install cc-zh@claude-code-zh`）。
> `validate` 给出的 marketplace 提示因此可以忽略。

## 补词条的方法

1. 会话里跑 `/cc-zh-dump`，拿到**仍为英文**的清单；
2. **用 `tools/runtime-sampler/` 取权威英文原文**当 key，值填中文，写进 `dict.json` 的 `exact`；
3. 新会话生效（词典每次会话读一次）。

> ⛔ **不要拿 `/cc-zh-dump` 的屏幕输出当 key** —— 渲染器会折行并**吞掉反引号**
> （实测 `` `claude doctor` ``、`` `anthropic` `` 的反引号界面上不显示），
> exact 表逐字匹配，错一个字符就永远命中不了且**不报错**。详见 `tools/README.md`。

**红线**：命不中一律放行原文，**绝不写「大概意思」的中文**；`CommandOutput.command/args`、
`ToolResult.tool` 等官方只读字段不得改写。

## 已知限制

- 需 **Claude Code ≥ 2.1.287**；mods API 官方明示「can change between releases」⇒ 跟随版本维护。
- `modes` 段恒空（`SessionMode.props.modes` 实测为 `[]`），页脚 pills 由引擎独占绘制。
- 翻译只改**绘制**，不改存储：`ctrl+o` 展开视图下部分内容可能仍为原文（引擎语义如此）。
- `config.describe` 仍走裸 `exact` 查表（未接 `patterns`）；实测 `/config` 的 label 不含 ANSI
  转义，故当前无影响。若将来出现带变量或带 ANSI 的配置 label，需同样改造。
