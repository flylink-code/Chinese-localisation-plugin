'use strict'

const fsp = require('node:fs').promises
const path = require('node:path')
const os = require('node:os')
const {
  exists,
  readJsonSafe,
  listDir,
  runCommand,
  runCommandLine,
  parseVersion,
  compareVersions,
  makeId,
  normalizePath,
  errorMessage,
} = require('../util.cjs')

function candidateCliPaths() {
  const home = os.homedir()
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const names = process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']
  const dirs =
    process.platform === 'win32'
      ? [
          path.join(appData, 'npm'),
          path.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
          path.join(localAppData, 'Programs', 'claude'),
          path.join(localAppData, 'Programs', 'Claude Code'),
        ]
      : [
          path.join(home, '.local', 'bin'),
          path.join(home, '.npm-global', 'bin'),
          '/usr/local/bin',
          '/usr/bin',
          '/snap/bin',
        ]
  return dirs.flatMap((dir) => names.map((name) => path.join(dir, name)))
}

async function findCliExecutables(manualPath) {
  const found = []
  const seen = new Set()
  async function add(file) {
    if (!file || !(await exists(file))) return
    const stat = await fsp.stat(file).catch(() => null)
    if (!stat || !stat.isFile()) return
    let real = file
    try {
      real = await fsp.realpath(file)
    } catch {
      real = file
    }
    const key = normalizePath(real)
    if (seen.has(key)) return
    seen.add(key)
    found.push({ executable: real, requested: file })
  }

  if (manualPath) {
    const stat = await fsp.stat(manualPath).catch(() => null)
    if (stat?.isFile()) await add(manualPath)
    else if (stat?.isDirectory()) {
      for (const name of process.platform === 'win32' ? ['claude.cmd', 'claude.exe', 'claude'] : ['claude']) {
        await add(path.join(manualPath, name))
      }
    }
  }

  const where = await runCommand(process.platform === 'win32' ? 'where.exe' : 'which', ['claude'], { timeout: 5000 })
  if (where.ok) {
    for (const line of where.stdout.split(/\r?\n/)) {
      const value = line.trim()
      if (value) await add(value)
    }
  }

  for (const candidate of candidateCliPaths()) await add(candidate)

  // 同一目录同时存在 claude.cmd 与 claude 时优先使用 Windows 可执行入口
  const byDir = new Map()
  for (const item of found) {
    const dir = normalizePath(path.dirname(item.executable))
    const current = byDir.get(dir)
    if (!current) byDir.set(dir, item)
    else if (process.platform === 'win32' && item.executable.toLowerCase().endsWith('.cmd')) byDir.set(dir, item)
  }
  return [...byDir.values()]
}

async function readCliVersion(executable) {
  const quoted = `"${executable.replace(/"/g, '')}"`
  const result = await runCommandLine(`${quoted} --version`, { timeout: 10000 })
  if (result.ok) {
    const parsed = parseVersion(result.stdout)
    if (parsed) return { version: parsed.text, source: 'claude --version' }
  }
  const home = os.homedir()
  const packageCandidates = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'package.json'),
    path.join(path.dirname(executable), '..', 'node_modules', '@anthropic-ai', 'claude-code', 'package.json'),
    path.join(path.dirname(executable), '..', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'package.json'),
    path.join(path.dirname(executable), 'node_modules', '@anthropic-ai', 'claude-code', 'package.json'),
    '/usr/local/lib/node_modules/@anthropic-ai/claude-code/package.json',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/package.json',
    path.join(home, '.npm-global', 'lib', 'node_modules', '@anthropic-ai', 'claude-code', 'package.json'),
  ]
  for (const file of packageCandidates) {
    const json = await readJsonSafe(file)
    const parsed = json.ok ? parseVersion(json.value?.version) : null
    if (parsed) return { version: parsed.text, source: 'package.json' }
  }
  return { version: null, source: null, error: result.stderr?.trim() || errorMessage(result.error) }
}

function cliChannel(executable) {
  const lower = executable.toLowerCase()
  if (lower.includes('\\appdata\\roaming\\npm\\') || lower.includes('/lib/node_modules/')) return 'npm 全局安装'
  if (lower.includes('\\.local\\bin\\') || lower.includes('/.local/bin/')) return '官方原生安装'
  if (lower.includes('winget')) return 'WinGet'
  return '命令行入口'
}

async function findIdeExtensions() {
  const home = os.homedir()
  const roots = [
    path.join(home, '.vscode', 'extensions'),
    path.join(home, '.vscode-insiders', 'extensions'),
    path.join(home, '.cursor', 'extensions'),
    path.join(home, '.windsurf', 'extensions'),
  ]
  const results = []
  for (const root of roots) {
    const entries = await listDir(root)
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('anthropic.claude-code-')) continue
      const full = path.join(root, entry.name)
      const pkg = await readJsonSafe(path.join(full, 'package.json'))
      const version = pkg.ok ? String(pkg.value?.version || '') : ''
      results.push({
        path: full,
        version: version || null,
        host: entry.name.includes('cursor')
          ? 'Cursor'
          : root.includes('.vscode-insiders')
            ? 'VS Code Insiders'
            : root.includes('.cursor')
              ? 'Cursor'
              : root.includes('.windsurf')
                ? 'Windsurf'
                : 'VS Code',
      })
    }
  }
  return results
}

/** 读取 Claude Code 的插件登记表，用登记 ID 判断插件是否在设置中启用。 */
async function readPluginRegistry() {
  const file = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json')
  const registry = await readJsonSafe(file)
  if (!registry.ok || !registry.value?.plugins || typeof registry.value.plugins !== 'object') return []
  const entries = []
  for (const [id, installs] of Object.entries(registry.value.plugins)) {
    if (!id.includes('@') || !Array.isArray(installs)) continue
    for (const install of installs) {
      if (install && typeof install.installPath === 'string' && install.installPath) {
        entries.push({ id, installPath: install.installPath })
      }
    }
  }
  return entries
}

function isChinesePlugin(manifest) {
  const name = String(manifest?.name || '')
  const description = String(manifest?.description || '')
  return name === 'cc-zh' || /claude-code-zh/i.test(name) || /中文|chinese|zh-CN/i.test(description)
}

/** 列出已登记的中文插件及其启用状态；未登记目录不作为可接管对象。 */
async function findExternalPlugins(settingsPath) {
  const settings = await readJsonSafe(settingsPath)
  const enabledPlugins = settings.ok ? settings.value?.enabledPlugins : undefined
  const registry = await readPluginRegistry()
  const byId = new Map()
  for (const entry of registry) {
    if (byId.has(entry.id)) continue
    const manifest = await readJsonSafe(path.join(entry.installPath, '.claude-plugin', 'plugin.json'))
    if (!manifest.ok || !isChinesePlugin(manifest.value)) continue
    byId.set(entry.id, {
      id: entry.id,
      name: String(manifest.value.name || entry.id),
      path: entry.installPath,
      version: typeof manifest.value.version === 'string' ? manifest.value.version : null,
      enabled:
        enabledPlugins && typeof enabledPlugins === 'object' && !Array.isArray(enabledPlugins)
          ? enabledPlugins[entry.id] !== false
          : true,
    })
  }
  return [...byId.values()]
}

function statusForClaudeCode(inspect, externalPlugins, settingsLanguage) {
  const evidence = []
  if (!inspect.settingsReadable && inspect.settingsExists) {
    return {
      state: 'unknown',
      label: '待确认',
      detail: 'settings.json 无法解析，暂时无法判断汉化状态',
      evidence: ['配置文件：~/.claude/settings.json'],
      coverage: [],
    }
  }
  if (inspect.state && inspect.managedMarker && inspect.pluginPresent && inspect.configured) {
    evidence.push(`插件目录：${inspect.state.pluginTarget}`)
    evidence.push(`插件版本：${inspect.state.pluginVersion || '未知'}`)
    evidence.push(`安装时间：${inspect.state.installedAt || '未知'}`)
    return {
      state: 'managed',
      label: '已汉化',
      detail: '由本软件通过 Claude Code 官方插件扩展点安装',
      evidence,
      coverage: ['部分终端界面文案'],
    }
  }
  if (inspect.state) {
    if (!inspect.pluginPresent) evidence.push('插件目录缺失')
    if (!inspect.configured) evidence.push('settings.json 中没有对应的插件目录配置')
    if (!inspect.managedMarker) evidence.push('插件目录缺少本软件管理标记')
    return {
      state: 'stale',
      label: '配置异常',
      detail: '存在本软件的安装记录，但插件或配置不完整',
      evidence,
      coverage: [],
    }
  }
  const external = externalPlugins.filter((item) => item.enabled)
  if (external.length) {
    const names = external.map((item) => item.name).join('、')
    return {
      state: 'external',
      label: '外部汉化',
      detail: `检测到其他来源的中文插件：${names}。应用内置汉化时会停用它，卸载汉化时恢复。`,
      evidence: external.map(
        (item) => `${item.name}${item.version ? ` v${item.version}` : ''}：${item.path}`,
      ),
      coverage: [],
      externalPlugins: external.map(({ id, name, path, version, enabled }) => ({
        id,
        name,
        path,
        version,
        enabled,
      })),
    }
  }
  if (settingsLanguage) {
    evidence.push(`settings.json 语言偏好：${settingsLanguage}（影响模型回复语言，不等同于界面汉化）`)
  }
  return {
    state: 'none',
    label: '未汉化',
    detail: '未检测到有效的 Claude Code 中文界面插件',
    evidence,
    coverage: [],
  }
}

function capabilitiesFor({ form, localization, version }) {
  const capabilities = []
  const minVersion = '2.1.287'
  if (form === 'ide-extension') {
    capabilities.push({
      kind: 'apply',
      enabled: false,
      reason: '该汉化插件面向 Claude Code CLI，IDE 扩展需使用官方语言设置',
    })
    capabilities.push({ kind: 'uninstall', enabled: false, reason: '未通过本软件安装汉化' })
    return capabilities
  }
  const versionCheck = version ? compareVersions(version, minVersion) : null
  const versionBlock = !version
    ? '无法确认 CLI 版本，暂不允许修改'
    : versionCheck === -1
      ? `该版本低于插件要求的 ${minVersion}`
      : null
  if (localization.state === 'managed' || localization.state === 'stale') {
    capabilities.push({
      kind: 'apply',
      enabled: !versionBlock,
      label: '重新汉化',
      reason: versionBlock || '使用当前仓库配置重新应用汉化',
    })
    capabilities.push({
      kind: 'uninstall',
      enabled: true,
      reason: localization.state === 'stale' ? '可尝试移除本软件残留配置' : '恢复原版英文界面',
    })
    return capabilities
  }
  if (localization.state === 'external') {
    const names = (localization.externalPlugins || []).map((item) => item.name).join('、') || '外部中文插件'
    capabilities.push({
      kind: 'apply',
      enabled: !versionBlock,
      reason: versionBlock || `将停用外部中文插件：${names}（卸载汉化时恢复）`,
    })
    capabilities.push({ kind: 'uninstall', enabled: false, reason: '外部汉化不由本软件管理' })
    return capabilities
  }
  if (localization.state === 'unknown') {
    capabilities.push({ kind: 'apply', enabled: false, reason: '无法解析 settings.json，暂不允许修改' })
    capabilities.push({ kind: 'uninstall', enabled: false, reason: '无法解析 settings.json' })
    return capabilities
  }
  if (versionBlock) {
    capabilities.push({ kind: 'apply', enabled: false, reason: versionBlock })
    capabilities.push({ kind: 'uninstall', enabled: false, reason: '未安装汉化' })
    return capabilities
  }
  capabilities.push({ kind: 'apply', enabled: true, reason: `需要 CLI ≥ ${minVersion}` })
  capabilities.push({ kind: 'uninstall', enabled: false, reason: '未安装汉化' })
  return capabilities
}

async function detectClaudeCode(ctx) {
  const { localizationService, manualPath } = ctx
  const inspect = await localizationService.inspect()
  const settings = await readJsonSafe(localizationService.settingsPath)
  const language = settings.ok && typeof settings.value?.language === 'string' ? settings.value.language : null
  const externalPlugins = await findExternalPlugins(localizationService.settingsPath)
  const localization = statusForClaudeCode(inspect, externalPlugins, language)

  const instances = []
  const executables = await findCliExecutables(manualPath)
  for (const entry of executables) {
    const versionInfo = await readCliVersion(entry.executable)
    const instance = {
      id: makeId('claude-code', entry.executable),
      toolId: 'claude-code',
      form: 'cli',
      formLabel: 'CLI',
      name: 'Claude Code CLI',
      path: entry.executable,
      version: versionInfo.version,
      versionSource: versionInfo.source,
      channel: manualPath ? '手动指定' : cliChannel(entry.executable),
      evidence: [`命令行入口：${entry.executable}`, versionInfo.source ? `版本来源：${versionInfo.source}` : '未能读取版本'],
      localization: { ...localization },
      warnings: [],
      installed: true,
    }
    instance.capabilities = capabilitiesFor({
      form: 'cli',
      localization,
      version: versionInfo.version,
    })
    if (!versionInfo.version && versionInfo.error) {
      instance.warnings.push(`读取版本失败：${versionInfo.error}`)
    }
    instances.push(instance)
  }

  const extensions = await findIdeExtensions()
  for (const ext of extensions) {
    const instance = {
      id: makeId('claude-code-ide', ext.path),
      toolId: 'claude-code',
      form: 'ide-extension',
      formLabel: `${ext.host} 扩展`,
      name: `Claude Code · ${ext.host}`,
      path: ext.path,
      version: ext.version,
      versionSource: 'package.json',
      channel: 'IDE 扩展',
      evidence: [`扩展目录：${ext.path}`],
      localization: {
        state: 'none',
        label: '未汉化',
        detail:
          localization.state === 'managed'
            ? 'CLI 已由本软件汉化；IDE 扩展界面独立，不随 CLI 插件变化'
            : 'IDE 扩展不使用本软件的 CLI 插件汉化',
        evidence: [`扩展目录：${ext.path}`],
        coverage: [],
      },
      warnings: [],
      installed: true,
    }
    instance.capabilities = capabilitiesFor({
      form: 'ide-extension',
      localization,
      version: ext.version,
    })
    instances.push(instance)
  }

  const notes = []
  if (!instances.length) {
    notes.push('未在本机已知位置发现 Claude Code CLI 或 IDE 扩展。')
  }
  if (localization.state === 'managed' && executables.length === 0) {
    notes.push('检测到本软件写入的汉化配置，但当前未发现 CLI 可执行文件。')
  }

  return { instances, notes }
}

module.exports = {
  detectClaudeCode,
  findCliExecutables,
  findIdeExtensions,
  findExternalPlugins,
  statusForClaudeCode,
  capabilitiesFor,
}
