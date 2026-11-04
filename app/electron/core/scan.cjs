'use strict'

const os = require('node:os')
const path = require('node:path')
const { exists, readJsonSafe, runPowerShell, makeId, errorMessage } = require('./util.cjs')
const { SOURCES } = require('./external-catalog.cjs')
const { detectClaudeCode } = require('./adapters/claude-code.cjs')
const { detectClaudeDesktop } = require('./adapters/claude-desktop.cjs')
const { detectAntigravity } = require('./adapters/antigravity.cjs')

async function readTargetVersion(targetPath) {
  for (const candidate of [
    path.join(targetPath, 'package.json'),
    path.join(targetPath, 'resources', 'app', 'package.json'),
    path.join(targetPath, 'app', 'resources', 'app', 'package.json'),
    path.join(targetPath, 'resources', 'app', 'product.json'),
  ]) {
    const pkg = await readJsonSafe(candidate)
    if (pkg.ok && pkg.value?.version) {
      return String(pkg.value.version)
    }
  }
  const msixMatch = path.basename(targetPath).match(/_([0-9]+(?:\.[0-9]+)+)_/)
  if (msixMatch) return msixMatch[1]
  return null
}

async function findRootFromEnvPath(binNames) {
  const dirs = String(process.env.PATH || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
  for (const dir of dirs) {
    for (const binName of binNames) {
      const full = path.join(dir, binName)
      if (!(await exists(full))) continue
      const norm = dir.replace(/\\/g, '/').toLowerCase()
      if (norm.endsWith('/resources/app/bin')) {
        return path.resolve(dir, '..', '..', '..')
      }
      if (norm.endsWith('/bin')) {
        return path.resolve(dir, '..')
      }
      return dir
    }
  }
  return null
}

async function buildRepoInstance({
  toolId,
  toolName,
  targetPath,
  version,
  channel,
  form = 'desktop-app',
  formLabel = '桌面应用',
  defaultRepo,
  external,
  hasBackupMarker = false,
}) {
  const isInstalled = external?.status === 'installed' || hasBackupMarker
  const repoLabel = external?.repo || defaultRepo || 'GitHub 仓库'
  const state = external?.status === 'installed' ? 'managed' : hasBackupMarker ? 'external' : 'none'
  const localization = isInstalled
    ? {
        state,
        label: state === 'managed' ? '已汉化' : '外部汉化',
        detail: `已检测到 ${repoLabel} 汉化补丁记录`,
        evidence: [`目标路径：${targetPath}`, `仓库：${repoLabel}`],
        coverage: [],
      }
    : {
        state: 'none',
        label: '未汉化',
        detail: `已绑定 ${repoLabel}，可一键执行汉化脚本`,
        evidence: [`目标路径：${targetPath}`, `仓库：${repoLabel}`],
        coverage: [],
      }
  return {
    id: makeId(toolId, targetPath),
    toolId,
    form,
    formLabel,
    name: `${toolName}${version ? ` ${version}` : ''}`,
    path: targetPath,
    version,
    versionSource: version ? 'package.json' : null,
    channel,
    evidence: [`目标路径：${targetPath}`],
    localization,
    warnings: [],
    installed: true,
    capabilities: [
      {
        kind: 'apply',
        enabled: true,
        label: isInstalled ? '重新汉化' : '一键汉化',
        reason: `运行 ${repoLabel} 安装脚本`,
      },
      {
        kind: 'uninstall',
        enabled: Boolean(isInstalled),
        reason: isInstalled ? `运行 ${repoLabel} 还原脚本` : '当前未检测到已安装的汉化补丁',
      },
    ],
  }
}

async function detectCursor(ctx) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
  const pathRoot = await findRootFromEnvPath(['cursor.cmd', 'Cursor.exe', 'cursor'])
  const candidates = [
    ctx.manualPath ? { dir: ctx.manualPath, channel: '手动指定' } : null,
    pathRoot ? { dir: pathRoot, channel: '系统 PATH 安装' } : null,
    { dir: path.join(localAppData, 'Programs', 'cursor'), channel: '默认安装位置' },
    { dir: path.join(programFiles, 'cursor'), channel: '系统安装位置' },
    ...['C', 'D', 'E', 'F'].map((d) => ({ dir: `${d}:\\software\\cursor`, channel: '软件目录安装' })),
    { dir: '/opt/Cursor', channel: 'Linux 安装位置' },
    { dir: '/usr/share/cursor', channel: 'Linux 安装位置' },
    { dir: '/Applications/Cursor.app/Contents/Resources/app', channel: 'macOS 安装位置' },
  ].filter(Boolean)

  const seen = new Set()
  for (const item of candidates) {
    const key = path.resolve(item.dir).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!(await exists(item.dir))) continue
    const valid =
      Boolean(ctx.manualPath && item.dir === ctx.manualPath) ||
      (await exists(path.join(item.dir, 'resources', 'app', 'package.json'))) ||
      (await exists(path.join(item.dir, 'Cursor.exe'))) ||
      (await exists(path.join(item.dir, 'package.json')))
    if (!valid) continue
    const version = await readTargetVersion(item.dir)
    const hasBackup =
      (await exists(path.join(item.dir, 'resources', 'app', 'out', '.i18n-backup'))) ||
      (await exists(path.join(item.dir, 'resources', 'app', '.cursor-zh-backup')))
    const instance = await buildRepoInstance({
      toolId: 'cursor',
      toolName: 'Cursor',
      targetPath: item.dir,
      version,
      channel: item.channel,
      defaultRepo: SOURCES.cursor?.repo,
      external: ctx.external,
      hasBackupMarker: hasBackup,
    })
    return { instances: [instance], notes: [] }
  }
  return { instances: [], notes: ['未检测到 Cursor 安装目录，可点击「指定安装目录」手动绑定。'] }
}

async function detectCodexDesktop(ctx) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const candidates = [
    ctx.manualPath ? { dir: ctx.manualPath, channel: '手动指定', version: null } : null,
    { dir: path.join(localAppData, 'CodexZH'), channel: '便携汉化目录', version: null },
    { dir: path.join(localAppData, 'Programs', 'Codex'), channel: '默认安装位置', version: null },
  ].filter(Boolean)

  if (process.platform === 'win32') {
    const res = await runPowerShell(
      'Get-AppxPackage *Codex* -ErrorAction SilentlyContinue | Select-Object Name, Version, InstallLocation | ConvertTo-Json -Compress',
      { timeout: 8000 },
    )
    if (res.ok && res.stdout.trim()) {
      try {
        const parsed = JSON.parse(res.stdout.trim())
        const list = Array.isArray(parsed) ? parsed : [parsed]
        for (const pkg of list) {
          if (pkg?.InstallLocation) {
            candidates.push({
              dir: String(pkg.InstallLocation),
              channel: 'MSIX / Microsoft Store',
              version: pkg.Version ? String(pkg.Version) : null,
            })
          }
        }
      } catch {
        // 忽略 JSON 解析异常
      }
    }
  }

  const seen = new Set()
  for (const item of candidates) {
    const key = path.resolve(item.dir).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!(await exists(item.dir))) continue
    const version = item.version || (await readTargetVersion(item.dir))
    const instance = await buildRepoInstance({
      toolId: 'codex-desktop',
      toolName: 'Codex Desktop',
      targetPath: item.dir,
      version,
      channel: item.channel,
      defaultRepo: SOURCES['codex-desktop']?.repo,
      external: ctx.external,
    })
    return { instances: [instance], notes: [] }
  }
  return { instances: [], notes: ['未检测到 Codex Desktop，可点击「指定安装目录」手动绑定。'] }
}

async function detectKiro(ctx) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files'
  const pathRoot = await findRootFromEnvPath(['kiro.cmd', 'Kiro.exe', 'kiro'])
  const candidates = [
    ctx.manualPath ? { dir: ctx.manualPath, channel: '手动指定' } : null,
    pathRoot ? { dir: pathRoot, channel: '系统 PATH 安装' } : null,
    { dir: path.join(localAppData, 'Programs', 'Kiro'), channel: '默认安装位置' },
    { dir: path.join(programFiles, 'Kiro'), channel: '系统安装位置' },
    ...['C', 'D', 'E', 'F'].map((d) => ({ dir: `${d}:\\software\\Kiro`, channel: '软件目录安装' })),
    { dir: '/opt/Kiro', channel: 'Linux 安装位置' },
    { dir: '/usr/share/kiro', channel: 'Linux 安装位置' },
    { dir: '/Applications/Kiro.app/Contents/Resources/app', channel: 'macOS 安装位置' },
  ].filter(Boolean)

  const seen = new Set()
  for (const item of candidates) {
    const key = path.resolve(item.dir).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!(await exists(item.dir))) continue
    const valid =
      Boolean(ctx.manualPath && item.dir === ctx.manualPath) ||
      (await exists(path.join(item.dir, 'resources', 'app', 'package.json'))) ||
      (await exists(path.join(item.dir, 'Kiro.exe'))) ||
      (await exists(path.join(item.dir, 'package.json')))
    if (!valid) continue
    const version = await readTargetVersion(item.dir)
    const hasBackup = await exists(
      path.join(item.dir, 'resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js.kiro-zh-bak'),
    )
    const instance = await buildRepoInstance({
      toolId: 'kiro',
      toolName: 'Kiro',
      targetPath: item.dir,
      version,
      channel: item.channel,
      defaultRepo: SOURCES.kiro?.repo,
      external: ctx.external,
      hasBackupMarker: hasBackup,
    })
    return { instances: [instance], notes: [] }
  }
  return { instances: [], notes: ['未检测到 Kiro 安装目录，可点击「指定安装目录」手动绑定。'] }
}

async function detectOpenCode(ctx) {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const pathRoot = await findRootFromEnvPath(['opencode.cmd', 'opencode.exe', 'opencode'])
  const candidates = [
    ctx.manualPath ? { dir: ctx.manualPath, channel: '手动指定' } : null,
    { dir: path.join(appData, 'npm', 'node_modules', '@opencode', 'cli'), channel: 'npm 全局安装' },
    { dir: path.join(appData, 'npm', 'node_modules', 'opencode-ai'), channel: 'npm 全局安装' },
    { dir: path.join(os.homedir(), '.opencode-i18n'), channel: '中文终端版目录' },
    { dir: path.join(localAppData, 'opencode-i18n-preview'), channel: '中文预览版目录' },
    pathRoot ? { dir: pathRoot, channel: '系统 PATH 安装' } : null,
  ].filter(Boolean)

  const seen = new Set()
  for (const item of candidates) {
    const key = path.resolve(item.dir).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (!(await exists(item.dir))) continue
    const version = await readTargetVersion(item.dir)
    const instance = await buildRepoInstance({
      toolId: 'opencode',
      toolName: 'OpenCode',
      targetPath: item.dir,
      version,
      channel: item.channel,
      form: 'cli',
      formLabel: 'CLI / TUI',
      defaultRepo: SOURCES.opencode?.repo,
      external: ctx.external,
    })
    return { instances: [instance], notes: [] }
  }
  return { instances: [], notes: ['未检测到 OpenCode，可点击「指定安装目录」手动绑定。'] }
}

const ADAPTERS = {
  'claude-code': detectClaudeCode,
  'claude-desktop': detectClaudeDesktop,
  antigravity: detectAntigravity,
  cursor: detectCursor,
  'codex-desktop': detectCodexDesktop,
  kiro: detectKiro,
  opencode: detectOpenCode,
}

async function detectCustomTool(toolId, ctx) {
  const custom = ctx.customTool || null
  const targetPath = ctx.manualPath || custom?.path || null
  if (!targetPath || !(await exists(targetPath))) {
    return {
      instances: [],
      notes: ['未找到指定的安装路径，请重新选择目录。'],
    }
  }
  let version = null
  for (const candidate of [
    path.join(targetPath, 'package.json'),
    path.join(targetPath, 'resources', 'app', 'package.json'),
    path.join(targetPath, 'app', 'resources', 'app', 'package.json'),
    path.join(targetPath, 'resources', 'app', 'product.json'),
  ]) {
    const pkg = await readJsonSafe(candidate)
    if (pkg.ok && pkg.value?.version) {
      version = String(pkg.value.version)
      break
    }
  }
  if (!version) {
    const msixMatch = path.basename(targetPath).match(/_([0-9]+(?:\.[0-9]+)+)_/)
    if (msixMatch) version = msixMatch[1]
  }
  const external = ctx.external
  const isInstalled = external?.status === 'installed'
  const repoLabel = custom?.repo || external?.repo || '自定义仓库'
  const localization = isInstalled
    ? {
        state: 'managed',
        label: '已汉化',
        detail: `已通过 ${repoLabel} 执行汉化脚本`,
        evidence: [`目标路径：${targetPath}`, `仓库：${repoLabel}`],
        coverage: [],
      }
    : {
        state: 'none',
        label: '未汉化',
        detail: `已绑定 ${repoLabel}，可一键执行汉化脚本`,
        evidence: [`目标路径：${targetPath}`, `仓库：${repoLabel}`],
        coverage: [],
      }
  return {
    instances: [
      {
        id: makeId(toolId, targetPath),
        toolId,
        form: 'desktop-app',
        formLabel: '自定义软件',
        name: `${custom?.name || toolId}${version ? ` ${version}` : ''}`,
        path: targetPath,
        version,
        versionSource: version ? 'package.json' : null,
        channel: '自定义目录',
        evidence: [`目标路径：${targetPath}`],
        localization,
        warnings: [],
        installed: true,
        capabilities: [
          {
            kind: 'apply',
            enabled: true,
            label: isInstalled ? '重新汉化' : '一键汉化',
            reason: `运行 ${repoLabel} 安装脚本`,
          },
          {
            kind: 'uninstall',
            enabled: true,
            reason: `运行 ${repoLabel} 还原脚本`,
          },
        ],
      },
    ],
    notes: [],
  }
}

function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function detectTool(toolId, ctx) {
  const adapter = ADAPTERS[toolId]
  if (adapter) {
    return withTimeout(adapter(ctx), 45000, '检测超时，请检查安装路径或权限后重试')
  }
  if (String(toolId).startsWith('custom-') || ctx?.customTool) {
    return withTimeout(detectCustomTool(toolId, ctx), 15000, '自定义软件检测超时')
  }
  throw new Error(`没有为 ${toolId} 注册检测适配器`)
}

async function detectAll({ tools, config, services, ownStates, signal, onEvent }) {
  const started = Date.now()
  for (const tool of tools) onEvent?.({ type: 'tool-start', toolId: tool.id })

  const jobs = tools.map(async (tool) => {
    const startedAt = Date.now()
    try {
      const manualPath = config.manualPaths?.[tool.id] || tool.path || null
      const customTool = (config.customTools || []).find((item) => item.id === tool.id) || null
      const output = await detectTool(tool.id, {
        manualPath,
        customTool,
        localizationService: services.localizationService,
        external: ownStates?.[tool.id] || null,
      })
      const instances = (output.instances || []).sort((a, b) => Number(b.installed) - Number(a.installed))
      if (process.env.LOCALISER_DEBUG) {
        console.log(`[detect] ${tool.id}: ${instances.length} 个实例，${Date.now() - startedAt}ms，manual=${manualPath || '无'}`)
      }
      const result = {
        toolId: tool.id,
        status: instances.length ? 'ok' : 'not-installed',
        instances,
        notes: output.notes || [],
        error: null,
        scannedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }
      if (!signal?.aborted) onEvent?.({ type: 'tool-result', result })
      return result
    } catch (error) {
      const result = {
        toolId: tool.id,
        status: 'error',
        instances: [],
        notes: [],
        error: errorMessage(error),
        scannedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }
      if (!signal?.aborted) onEvent?.({ type: 'tool-error', result })
      return result
    }
  })

  const all = Promise.all(jobs)
  if (!signal) {
    const results = await all
    onEvent?.({ type: 'complete', results })
    return { cancelled: false, results }
  }

  const aborted = new Promise((resolve) => {
    if (signal.aborted) resolve({ cancelled: true, results: [] })
    signal.addEventListener('abort', () => resolve({ cancelled: true, results: [] }), { once: true })
  })
  const completed = all.then((results) => {
    onEvent?.({ type: 'complete', results })
    return { cancelled: false, results }
  })
  const outcome = await Promise.race([completed, aborted])
  if (outcome.cancelled) {
    return { cancelled: true, results: [], durationMs: Date.now() - started }
  }
  return outcome
}

module.exports = { detectAll, detectTool, ADAPTERS }
