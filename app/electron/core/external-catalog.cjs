'use strict'

const { compareVersions } = require('./util.cjs')

/**
 * GitHub 汉化仓库注册表与可视化配置定义。
 *
 * 每个软件默认绑定一个开箱即用的 GitHub 汉化仓库，支持：
 * 1. 直接拉取仓库最新分支代码（或按需切换到其他预设/自定义 GitHub 仓库）；
 * 2. 将原本需要在命令行/交互菜单输入的选项转换为界面上的可视化控件；
 * 3. 在卡片上一键执行安装、更新、恢复及仓库附加动作。
 */
const SOURCES = {
  'claude-code': {
    id: 'claude-code',
    toolName: 'Claude Code',
    name: 'Claude Code 汉化仓库',
    repo: 'jiangnanquan/claude-code-zh',
    branch: 'main',
    subDir: 'mods/cc-zh',
    commit: '8349fb97e1bfa68510227205a20c77876b0f50a3',
    archiveSha256: null,
    license: { spdx: 'MIT', file: 'LICENSE', marker: 'MIT License' },
    platforms: ['win32', 'linux', 'darwin'],
    runner: 'claude-plugin',
    entry: 'mods/cc-zh/.claude-plugin/plugin.json',
    uninstallEntry: '',
    versionRange: { min: '2.1.287' },
    elevated: false,
    blockWhenRunning: false,
    processNames: [],
    installArgs: [],
    uninstallArgs: [],
    defaultOptions: {
      takeoverExternal: true,
    },
    optionSchema: [
      {
        key: 'takeoverExternal',
        label: '自动停用冲突插件',
        type: 'boolean',
        hint: '汉化时自动停用其他已启用的中文插件，恢复原版时自动还原',
      },
    ],
    extraActions: [],
    presets: [
      {
        id: 'jiangnanquan-cc-zh',
        label: 'jiangnanquan/claude-code-zh（默认推荐 · 官方插件扩展点）',
        repo: 'jiangnanquan/claude-code-zh',
        branch: 'main',
        subDir: 'mods/cc-zh',
        entry: 'mods/cc-zh/.claude-plugin/plugin.json',
        runner: 'claude-plugin',
      },
      {
        id: 'taekchef-claude-code-zh-cn',
        label: 'taekchef/claude-code-zh-cn（836★ 热门中文插件源）',
        repo: 'taekchef/claude-code-zh-cn',
        branch: 'main',
        subDir: 'plugin',
        entry: 'plugin/.claude-plugin/plugin.json',
        runner: 'claude-plugin',
      },
    ],
    coverage: [
      '斜杠命令说明、/config 配置项与描述',
      'Spinner 状态词、提示行、工具调用折叠摘要与耗时提示',
    ],
    warnings: [],
  },
  'claude-desktop': {
    id: 'claude-desktop',
    toolName: 'Claude Desktop',
    name: 'Claude Desktop 汉化仓库',
    repo: 'javaht/claude-desktop-zh-cn',
    branch: 'main',
    commit: '444414d73d6238091f51429c34b9685067f65a2f',
    archiveSha256: 'e865acd416b11530fc1ae386b395fdde4d0bb1a1e5db1b2dcb302748125db3f4',
    license: { spdx: 'MIT', file: 'LICENSE', marker: 'MIT License' },
    platforms: ['win32'],
    runner: 'powershell',
    entry: 'scripts/install_windows.ps1',
    uninstallEntry: '',
    versionRange: {},
    language: 'zh-CN',
    elevated: true,
    blockWhenRunning: false,
    processNames: [],
    installArgs: ['install', 'zh-CN'],
    uninstallArgs: ['uninstall', 'zh-CN'],
    defaultOptions: {
      language: 'zh-CN',
    },
    optionSchema: [
      {
        key: 'language',
        label: '界面语言',
        type: 'select',
        choices: [
          { value: 'zh-CN', label: '简体中文 (zh-CN)' },
          { value: 'zh-TW', label: '繁體中文-台灣 (zh-TW)' },
          { value: 'zh-HK', label: '繁體中文-香港 (zh-HK)' },
        ],
      },
    ],
    extraActions: [
      {
        id: 'disable-updates',
        label: '禁止自动更新',
        args: ['disable-updates'],
        summary: '禁止 Claude Desktop 自动更新，避免升级覆盖中文补丁',
      },
      {
        id: 'enable-updates',
        label: '允许自动更新',
        args: ['enable-updates'],
        summary: '恢复 Claude Desktop 默认自动更新',
      },
      {
        id: 'sync-skills',
        label: '同步 CC Switch 技能',
        args: ['sync-skills'],
        summary: '将 ~/.cc-switch/skills 同步到 Claude Desktop',
      },
      {
        id: 'unsync-skills',
        label: '取消技能同步',
        args: ['unsync-skills'],
        summary: '移除由 CC Switch 同步的技能软链接',
      },
    ],
    presets: [
      {
        id: 'javaht-desktop-zh',
        label: 'javaht/claude-desktop-zh-cn（默认推荐 · UAC 完整注入）',
        repo: 'javaht/claude-desktop-zh-cn',
        branch: 'main',
        entry: 'scripts/install_windows.ps1',
        runner: 'powershell',
        elevated: true,
        installArgs: ['install', 'zh-CN'],
        uninstallArgs: ['uninstall', 'zh-CN'],
      },
      {
        id: 'su1003-claude-runtime-zh',
        label: 'Su-1003/claude-runtime-zh（免改安装文件 · 运行时汉化）',
        repo: 'Su-1003/claude-runtime-zh',
        branch: 'main',
        entry: 'launch-zh.ps1',
        runner: 'powershell',
        elevated: false,
        installArgs: [],
        uninstallArgs: ['-Restore'],
      },
    ],
    coverage: [
      'Claude Desktop 前端界面文案（ion-dist.asar / ion-dist）',
      '主进程原生菜单、托盘与语言词库（app.asar / resources/i18n）',
    ],
    warnings: [
      '安装需要管理员权限（自动弹出 UAC 窗口执行上游 PowerShell 脚本）。',
    ],
  },
  antigravity: {
    id: 'antigravity',
    toolName: 'Antigravity',
    name: 'Antigravity 汉化仓库',
    repo: 'Silas-02/antigravity-desktop-cn',
    branch: 'main',
    commit: 'bd9d60abb4506048b1b75f502c7eda28c4a05879',
    archiveSha256: '5bd847654d5c9df0e480cfa4a7ff991df1e9f9c99fe31fe6ab4188148ce760ba',
    license: null,
    platforms: ['win32', 'linux', 'darwin'],
    runner: 'electron-node',
    entry: 'localization_engine.js',
    uninstallEntry: '',
    versionRange: {},
    language: 'zh-CN',
    elevated: false,
    blockWhenRunning: false,
    processNames: ['Antigravity', 'antigravity'],
    installArgs: [],
    uninstallArgs: ['--huifu'],
    defaultOptions: {
      brandTitle: 'english',
      autoCloseProcess: true,
    },
    optionSchema: [
      {
        key: 'brandTitle',
        label: '品牌标题',
        type: 'select',
        choices: [
          { value: 'english', label: '保留英文 Antigravity' },
          { value: 'hidden', label: '隐藏品牌标题' },
        ],
      },
      {
        key: 'autoCloseProcess',
        label: '自动关闭运行中客户端',
        type: 'boolean',
        hint: '开启后汉化时自动关闭 Antigravity；关闭则附带 --no-kill 参数',
      },
    ],
    extraActions: [],
    presets: [
      {
        id: 'silas-antigravity-cn',
        label: 'Silas-02/antigravity-desktop-cn（推荐 · 全量字典注入）',
        repo: 'Silas-02/antigravity-desktop-cn',
        branch: 'main',
        entry: 'localization_engine.js',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: [],
        uninstallArgs: ['--huifu'],
      },
      {
        id: 'qqxpee-antigravity2-cn',
        label: 'qqxpee/antigravity2-cn（1.1k★ Antigravity 2.0 物理层注入）',
        repo: 'qqxpee/antigravity2-cn',
        branch: 'main',
        entry: 'localization_engine.js',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: [],
        uninstallArgs: ['--huifu'],
      },
      {
        id: 'souma-antigravity-zh-cn',
        label: 'Souma-Sumire/antigravity-zh-cn（Antigravity 2.0 补丁）',
        repo: 'Souma-Sumire/antigravity-zh-cn',
        branch: 'main',
        entry: 'install.js',
        uninstallEntry: 'uninstall.js',
        runner: 'electron-node',
        installArgs: [],
        uninstallArgs: [],
      },
      {
        id: 'yuexps-antigravity-hans',
        label: 'yuexps/Antigravity-Hans（经典引擎）',
        repo: 'yuexps/Antigravity-Hans',
        branch: 'main',
        entry: 'localization_engine.js',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: [],
        uninstallArgs: ['--huifu'],
      },
    ],
    coverage: [
      'Antigravity 主界面、顶部系统菜单与任务栏菜单',
      '设置面板、新手引导、对话、自动化与插件市场',
    ],
    warnings: [],
  },
  cursor: {
    id: 'cursor',
    toolName: 'Cursor',
    name: 'Cursor 汉化仓库',
    repo: 'lidefang0918/cursor-zh',
    branch: 'main',
    commit: null,
    archiveSha256: null,
    license: { spdx: 'MIT', file: 'LICENSE', marker: 'MIT License' },
    platforms: ['win32', 'linux', 'darwin'],
    runner: 'electron-node',
    entry: 'scripts/run.mjs',
    uninstallEntry: '',
    versionRange: {},
    elevated: false,
    blockWhenRunning: false,
    processNames: ['Cursor', 'cursor'],
    installArgs: ['localize', '--close', '--no-relaunch', '--offline', '--root={path}'],
    uninstallArgs: ['revert', '--close', '--no-relaunch', '--root={path}'],
    defaultOptions: {},
    optionSchema: [],
    extraActions: [],
    presets: [
      {
        id: 'lidefang-cursor-zh',
        label: 'lidefang0918/cursor-zh（推荐 · 精确适配 Cursor 3.27/3.28）',
        repo: 'lidefang0918/cursor-zh',
        branch: 'main',
        entry: 'scripts/run.mjs',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: ['localize', '--close', '--no-relaunch', '--offline', '--root={path}'],
        uninstallArgs: ['revert', '--close', '--no-relaunch', '--root={path}'],
      },
      {
        id: 'baishi-cursor-i18n-zh',
        label: 'baishi1114010/cursor-i18n-zh（54★ Node 零依赖词典汉化）',
        repo: 'baishi1114010/cursor-i18n-zh',
        branch: 'main',
        entry: 'index.js',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: ['localize', '-p', '{path}'],
        uninstallArgs: ['restore', '-p', '{path}'],
      },
      {
        id: 'cursor-zh-pack',
        label: '481232534/cursor-zh-pack（桌面补丁工具）',
        repo: '481232534/cursor-zh-pack',
        branch: 'main',
        entry: 'src/cli.js',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: ['apply', '-CursorDir', '{path}'],
        uninstallArgs: ['restore', '-CursorDir', '{path}'],
      },
    ],
    coverage: [
      'Cursor 顶部菜单、设置面板、Agent 对话框与 Composer 面板',
      '快捷键说明、扩展市场与常见状态提示',
    ],
    warnings: [],
  },
  'codex-desktop': {
    id: 'codex-desktop',
    toolName: 'Codex Desktop',
    name: 'Codex Desktop 汉化仓库',
    repo: 'aimiliya825/codex-desktop-zh-cn',
    branch: 'main',
    commit: null,
    archiveSha256: null,
    license: { spdx: 'MIT', file: 'LICENSE', marker: 'MIT License' },
    platforms: ['win32'],
    runner: 'powershell',
    entry: 'Install-CodexZh.ps1',
    uninstallEntry: 'Restore-CodexZh.ps1',
    versionRange: {},
    elevated: false,
    blockWhenRunning: false,
    processNames: ['Codex'],
    installArgs: ['-Yes', '-NoPause', '-LocaleOnly'],
    uninstallArgs: ['-Yes', '-NoPause'],
    defaultOptions: {},
    optionSchema: [],
    extraActions: [],
    presets: [
      {
        id: 'aimiliya-codex-locale-only',
        label: 'aimiliya825/codex-desktop-zh-cn（推荐 · 免改包仅注入中文词库）',
        repo: 'aimiliya825/codex-desktop-zh-cn',
        branch: 'main',
        entry: 'Install-CodexZh.ps1',
        uninstallEntry: 'Restore-CodexZh.ps1',
        runner: 'powershell',
        elevated: false,
        installArgs: ['-Yes', '-NoPause', '-LocaleOnly'],
        uninstallArgs: ['-Yes', '-NoPause'],
      },
      {
        id: 'aimiliya-codex-full',
        label: 'aimiliya825/codex-desktop-zh-cn（完整模式 · 注入词库 + 桌面启动器）',
        repo: 'aimiliya825/codex-desktop-zh-cn',
        branch: 'main',
        entry: 'Install-CodexZh.ps1',
        uninstallEntry: 'Restore-CodexZh.ps1',
        runner: 'powershell',
        elevated: false,
        installArgs: ['-Yes', '-NoPause'],
        uninstallArgs: ['-Yes', '-NoPause'],
      },
      {
        id: 'shuailiu-codex-portable',
        label: 'shuai-liu001/codex-zh（生成独立中文便携版 %LOCALAPPDATA%\\CodexZH）',
        repo: 'shuai-liu001/codex-zh',
        branch: 'main',
        entry: 'Install-CodexZH.ps1',
        uninstallEntry: '',
        runner: 'powershell',
        elevated: false,
        installArgs: [],
        uninstallArgs: [],
      },
    ],
    coverage: [
      'OpenAI Codex 桌面客户端主界面、会话管理与设置面板',
      '支持 MSIX 免修改原包的外部语言包注入与一键还原',
    ],
    warnings: [],
  },
  kiro: {
    id: 'kiro',
    toolName: 'Kiro',
    name: 'Kiro 汉化仓库',
    repo: 'polang233/kiro-language-pack',
    branch: 'main',
    commit: null,
    archiveSha256: null,
    license: { spdx: 'MIT', file: 'LICENSE', marker: 'MIT License' },
    platforms: ['win32', 'linux', 'darwin'],
    runner: 'electron-node',
    entry: 'bin/cli.mjs',
    uninstallEntry: '',
    versionRange: {},
    elevated: false,
    blockWhenRunning: false,
    processNames: ['Kiro', 'kiro'],
    installArgs: ['install', '--locale=zh-cn', '--dir={path}'],
    uninstallArgs: ['restore', '--dir={path}'],
    defaultOptions: {},
    optionSchema: [],
    extraActions: [],
    presets: [
      {
        id: 'kiro-zh-cn',
        label: 'polang233/kiro-language-pack（推荐 · 简体中文语言包 + 补丁）',
        repo: 'polang233/kiro-language-pack',
        branch: 'main',
        entry: 'bin/cli.mjs',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: ['install', '--locale=zh-cn', '--dir={path}'],
        uninstallArgs: ['restore', '--dir={path}'],
      },
      {
        id: 'kiro-zh-tw',
        label: 'polang233/kiro-language-pack（繁體中文语言包 + 补丁）',
        repo: 'polang233/kiro-language-pack',
        branch: 'main',
        entry: 'bin/cli.mjs',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: ['install', '--locale=zh-tw', '--dir={path}'],
        uninstallArgs: ['restore', '--dir={path}'],
      },
    ],
    coverage: [
      'Kiro 编辑器基础界面（基于 VS Code 中文语言包）',
      'Kiro 专属 Agent、Specs、Hooks、Steering 等面板补丁',
    ],
    warnings: [],
  },
  opencode: {
    id: 'opencode',
    toolName: 'OpenCode',
    name: 'OpenCode 汉化仓库',
    repo: 'xlht4106/opencode-zh-hans',
    branch: 'main',
    commit: null,
    archiveSha256: null,
    license: { spdx: 'MIT', file: 'LICENSE', marker: 'MIT License' },
    platforms: ['win32', 'linux', 'darwin'],
    runner: 'electron-node',
    entry: 'translate.js',
    uninstallEntry: '',
    versionRange: {},
    elevated: false,
    blockWhenRunning: false,
    processNames: [],
    installArgs: [],
    uninstallArgs: [],
    defaultOptions: {},
    optionSchema: [],
    extraActions: [],
    presets: [
      {
        id: 'xlht-opencode-zh-hans',
        label: 'xlht4106/opencode-zh-hans（推荐 · TUI 渲染层词典翻译插件）',
        repo: 'xlht4106/opencode-zh-hans',
        branch: 'main',
        entry: 'translate.js',
        uninstallEntry: '',
        runner: 'electron-node',
        installArgs: [],
        uninstallArgs: [],
      },
      {
        id: 'yuloop-opencode-auto',
        label: 'yuloop/OpenCodeChineseTranslationAuto（自动构建中文终端版）',
        repo: 'yuloop/OpenCodeChineseTranslationAuto',
        branch: 'main',
        entry: 'install.ps1',
        uninstallEntry: '',
        runner: 'powershell',
        elevated: false,
        installArgs: ['-Preview'],
        uninstallArgs: [],
      },
    ],
    coverage: [
      'OpenCode TUI 主界面、命令面板、设置、对话框与会话界面',
      '工具回合摘要与输入框 placeholder 词条翻译',
    ],
    warnings: [],
  },
}

/**
 * 近期活跃的常用 AI Agent 软件 GitHub 汉化仓库模板（供「+ 添加软件配置」一键填入）。
 */
const CUSTOM_TOOL_TEMPLATES = [
  {
    id: 'tpl-cursor-lidefang',
    name: 'Cursor',
    vendor: 'Anysphere',
    label: 'Cursor · lidefang0918/cursor-zh（精确适配 3.27/3.28 · 支持备份还原）',
    repo: 'lidefang0918/cursor-zh',
    branch: 'main',
    runner: 'electron-node',
    entry: 'scripts/run.mjs',
    uninstallEntry: '',
    installArgs: ['localize', '--close', '--no-relaunch', '--offline', '--root={path}'],
    uninstallArgs: ['revert', '--close', '--no-relaunch', '--root={path}'],
    elevated: false,
  },
  {
    id: 'tpl-cursor-i18n-zh',
    name: 'Cursor',
    vendor: 'Anysphere',
    label: 'Cursor · baishi1114010/cursor-i18n-zh（54★ Node 零依赖汉化）',
    repo: 'baishi1114010/cursor-i18n-zh',
    branch: 'main',
    runner: 'electron-node',
    entry: 'index.js',
    uninstallEntry: '',
    installArgs: ['localize', '-p', '{path}'],
    uninstallArgs: ['restore', '-p', '{path}'],
    elevated: false,
  },
  {
    id: 'tpl-codex-desktop-zh',
    name: 'Codex Desktop',
    vendor: 'OpenAI',
    label: 'Codex Desktop · aimiliya825/codex-desktop-zh-cn（免改包一键汉化）',
    repo: 'aimiliya825/codex-desktop-zh-cn',
    branch: 'main',
    runner: 'powershell',
    entry: 'Install-CodexZh.ps1',
    uninstallEntry: 'Restore-CodexZh.ps1',
    installArgs: ['-Yes', '-NoPause', '-LocaleOnly'],
    uninstallArgs: ['-Yes', '-NoPause'],
    elevated: false,
  },
  {
    id: 'tpl-codex-portable-zh',
    name: 'Codex 便携版',
    vendor: 'OpenAI',
    label: 'Codex Desktop · shuai-liu001/codex-zh（生成独立中文便携版）',
    repo: 'shuai-liu001/codex-zh',
    branch: 'main',
    runner: 'powershell',
    entry: 'Install-CodexZH.ps1',
    uninstallEntry: '',
    installArgs: [],
    uninstallArgs: [],
    elevated: false,
  },
  {
    id: 'tpl-kiro-language-pack',
    name: 'Kiro',
    vendor: 'AWS Kiro',
    label: 'Kiro IDE · polang233/kiro-language-pack（语言包 + 界面补丁）',
    repo: 'polang233/kiro-language-pack',
    branch: 'main',
    runner: 'electron-node',
    entry: 'bin/cli.mjs',
    uninstallEntry: '',
    installArgs: ['install', '--locale=zh-cn', '--dir={path}'],
    uninstallArgs: ['restore', '--dir={path}'],
    elevated: false,
  },
  {
    id: 'tpl-opencode-zh-hans',
    name: 'OpenCode',
    vendor: 'Anomaly',
    label: 'OpenCode · xlht4106/opencode-zh-hans（TUI 词典渲染插件）',
    repo: 'xlht4106/opencode-zh-hans',
    branch: 'main',
    runner: 'electron-node',
    entry: 'translate.js',
    uninstallEntry: '',
    installArgs: [],
    uninstallArgs: [],
    elevated: false,
  },
]

/** 将用户输入的 GitHub 地址或 owner/repo 规范化为 owner/repo。 */
function normalizeRepoSlug(input) {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('GitHub 仓库地址不能为空')
  const cleaned = raw
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length < 2) {
    throw new Error('GitHub 仓库格式应为 owner/repo 或 https://github.com/owner/repo')
  }
  const slug = `${parts[0]}/${parts[1]}`
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(slug)) {
    throw new Error('GitHub 仓库名称包含非法字符')
  }
  return slug
}

function sourceFor(toolId, override = null) {
  const base = SOURCES[toolId] || null
  if (!base && !override) return null
  if (!override) return base
  const merged = {
    ...(base || {
      id: toolId,
      toolName: override.toolName || override.name || toolId,
      name: `${override.toolName || override.name || toolId} 汉化仓库`,
      license: null,
      platforms: ['win32', 'linux', 'darwin'],
      versionRange: {},
      elevated: false,
      blockWhenRunning: false,
      processNames: [],
      uninstallEntry: '',
      installArgs: [],
      uninstallArgs: [],
      defaultOptions: {},
      optionSchema: [],
      extraActions: [],
      presets: [],
      coverage: [],
      warnings: [],
      custom: true,
    }),
  }
  if (override.repo) merged.repo = normalizeRepoSlug(override.repo)
  if (override.branch) merged.branch = String(override.branch).trim() || 'main'
  if (override.entry) merged.entry = String(override.entry).trim()
  if (override.uninstallEntry !== undefined) merged.uninstallEntry = String(override.uninstallEntry || '').trim()
  if (override.subDir !== undefined) merged.subDir = String(override.subDir || '').trim()
  if (override.runner) merged.runner = override.runner
  if (typeof override.elevated === 'boolean') merged.elevated = override.elevated
  if (Array.isArray(override.installArgs)) merged.installArgs = override.installArgs
  if (Array.isArray(override.uninstallArgs)) merged.uninstallArgs = override.uninstallArgs
  // 用户自定义了仓库或分支时，不再比较默认仓库的历史归档哈希
  if (
    base &&
    ((override.repo && normalizeRepoSlug(override.repo) !== base.repo) ||
      (override.branch && override.branch !== base.branch))
  ) {
    merged.archiveSha256 = null
    merged.commit = null
    merged.license = null
  }
  return merged
}

function shortCommit(commit) {
  if (!commit) return 'latest'
  return String(commit).slice(0, 7)
}

/**
 * 生成 GitHub 归档下载地址。
 * 默认直接拉取最新分支（refs/heads/<branch>），如果显式要求按固定 commit 下载则使用 commit。
 */
function archiveUrl(source, { useBranch = true } = {}) {
  const ref = !useBranch && source.commit ? source.commit : source.branch || 'main'
  return `https://codeload.github.com/${source.repo}/tar.gz/${ref}`
}

function platformLabel(platform) {
  return platform === 'win32' ? 'Windows' : platform === 'linux' ? 'Linux' : platform === 'darwin' ? 'macOS' : platform
}

function versionText(source) {
  if (source.versionRange?.exact?.length) return `适配 v${source.versionRange.exact.join(' / v')}`
  if (source.versionRange?.min) return `要求 v${source.versionRange.min} 及以上`
  return '全版本通用（随仓库更新）'
}

function describeSource(toolId, override = null, options = null) {
  const source = sourceFor(toolId, override)
  if (!source) return null
  const mergedOptions = {
    ...(source.defaultOptions || {}),
    ...(options && typeof options === 'object' ? options : {}),
  }
  return {
    id: source.id,
    toolName: source.toolName,
    name: source.name,
    repo: source.repo,
    branch: source.branch || 'main',
    commit: source.commit || null,
    shortCommit: shortCommit(source.commit || source.branch || 'main'),
    license: source.license ? source.license.spdx : null,
    versionText: versionText(source),
    homepage: `https://github.com/${source.repo}`,
    archiveSha256: source.archiveSha256 || null,
    runner: source.runner || 'electron-node',
    entry: source.entry,
    uninstallEntry: source.uninstallEntry || '',
    installArgs: source.installArgs || [],
    uninstallArgs: source.uninstallArgs || [],
    subDir: source.subDir || '',
    elevated: Boolean(source.elevated),
    platforms: (source.platforms || ['win32']).map(platformLabel),
    coverage: source.coverage || [],
    warnings: source.warnings || [],
    optionSchema: source.optionSchema || [],
    options: mergedOptions,
    extraActions: source.extraActions || [],
    presets: source.presets || [],
  }
}

/** 判断实例是否在已登记源的平台与版本范围内（不再锁死单点小版本）。 */
function checkCompatibility(toolId, instance, platform = process.platform, override = null) {
  const source = sourceFor(toolId, override)
  if (!source) return { ok: false, reason: '该工具尚未配置 GitHub 汉化仓库', source: null }
  if (source.platforms?.length && !source.platforms.includes(platform)) {
    return {
      ok: false,
      reason: `当前仓库脚本仅支持 ${source.platforms.map(platformLabel).join(' / ')}，当前系统为 ${platformLabel(platform)}`,
      source,
    }
  }
  const range = source.versionRange || {}
  if (range.exact?.length && instance?.version) {
    if (!range.exact.includes(instance.version)) {
      return {
        ok: false,
        reason: `要求版本 v${range.exact.join(' / v')}，当前 v${instance.version}`,
        source,
      }
    }
  }
  if (range.min && instance?.version) {
    const compared = compareVersions(instance.version, range.min)
    if (compared !== null && compared < 0) {
      return { ok: false, reason: `要求 ${source.toolName} v${range.min} 及以上，当前 v${instance.version}`, source }
    }
  }
  return { ok: true, reason: null, source }
}

module.exports = {
  SOURCES,
  CUSTOM_TOOL_TEMPLATES,
  sourceFor,
  describeSource,
  checkCompatibility,
  archiveUrl,
  shortCommit,
  versionText,
  platformLabel,
  normalizeRepoSlug,
}
