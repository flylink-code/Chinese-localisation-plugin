'use strict'

const fsp = require('node:fs').promises
const path = require('node:path')
const os = require('node:os')
const {
  exists,
  isDirectory,
  readJsonSafe,
  listDir,
  fileContainsAny,
  runPowerShell,
  runCommand,
  normalizePath,
  parseVersion,
  makeId,
} = require('../util.cjs')

const DESKTOP_MARKERS = ['__claudeZhLabelPatch', '__claudeZhSlashGloss', '__claudeZhOnlineLocaleMain']
const BACKUP_DIR_NAME = '.zh-cn-backups'

function localAppDataRoot() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
}

async function inspectDesktopApp(appDir, extra) {
  const resources = path.join(appDir, 'resources')
  const resourcesExists = await isDirectory(resources)
  const ionDistDir = await isDirectory(path.join(resources, 'ion-dist'))
  const ionDistAsar = await exists(path.join(resources, 'ion-dist.asar'))
  const appAsar = await exists(path.join(resources, 'app.asar'))
  const exe = await exists(path.join(appDir, 'Claude.exe'))
  const backupDir = await isDirectory(path.join(resources, BACKUP_DIR_NAME))
  const zhLocale = await exists(path.join(resources, 'i18n', 'zh-CN.json'))
  const markers = []
  for (const asar of ['app.asar', 'ion-dist.asar']) {
    const file = path.join(resources, asar)
    if (!(await exists(file))) continue
    const found = await fileContainsAny(file, DESKTOP_MARKERS)
    for (const marker of found) markers.push(`${asar} 含标记 ${marker}`)
  }
  const evidence = []
  if (resourcesExists) evidence.push(`资源目录：${resources}`)
  if (ionDistAsar) evidence.push('前端布局：ion-dist.asar')
  else if (ionDistDir) evidence.push('前端布局：ion-dist 目录')
  if (appAsar) evidence.push('主程序资源：app.asar')
  if (backupDir) evidence.push(`发现汉化备份目录：${BACKUP_DIR_NAME}`)
  if (zhLocale) evidence.push('存在 i18n/zh-CN.json')
  evidence.push(...markers)
  evidence.push(...(extra || []))

  let localization
  if (backupDir || markers.length) {
    localization = {
      state: 'external',
      label: '外部汉化',
      detail: '检测到其他汉化补丁的备份或注入标记，本软件不会覆盖',
      evidence,
      coverage: [],
    }
  } else if (zhLocale) {
    localization = {
      state: 'unknown',
      label: '中文资源待确认',
      detail: '存在中文语言资源，但无法确认由谁安装、是否生效',
      evidence,
      coverage: [],
    }
  } else if (!resourcesExists) {
    localization = {
      state: 'unknown',
      label: '资源不可读',
      detail: '安装目录存在，但未找到 resources，无法判断汉化状态',
      evidence,
      coverage: [],
    }
  } else {
    localization = {
      state: 'none',
      label: '未汉化',
      detail: '未检测到汉化补丁标记或备份',
      evidence,
      coverage: [],
    }
  }

  return { resources, localization, valid: resourcesExists && (exe || appAsar || ionDistAsar || ionDistDir), evidence }
}

async function appxInstances() {
  if (process.platform !== 'win32') return []
  const script = [
    "$items = Get-AppxPackage *Claude* -ErrorAction SilentlyContinue | Where-Object { $_.Publisher -match 'Anthropic' }",
    '$items | Select-Object Name, Version, InstallLocation | ConvertTo-Json -Compress',
  ].join('; ')
  const result = await runPowerShell(script, { timeout: 9000 })
  if (!result.ok || !result.stdout.trim()) return []
  let parsed
  try {
    parsed = JSON.parse(result.stdout.trim())
  } catch {
    return []
  }
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return items
    .filter((item) => item?.InstallLocation)
    .map((item) => ({
      root: String(item.InstallLocation),
      version: parseVersion(item.Version)?.text || String(item.Version || '') || null,
      name: String(item.Name || 'Claude'),
      channel: 'MSIX / Microsoft Store',
    }))
}

async function findManual(appPath) {
  const stat = await fsp.stat(appPath).catch(() => null)
  if (!stat) return []
  if (stat.isFile()) {
    return [{ root: path.dirname(appPath), version: null, channel: '手动指定' }]
  }
  const entries = await listDir(appPath)
  const hasResources = entries.some((entry) => entry.name === 'resources' && entry.isDirectory())
  if (hasResources) return [{ root: appPath, version: null, channel: '手动指定' }]
  const nested = entries.filter((entry) => entry.isDirectory() && /^app-\d/.test(entry.name))
  return nested.map((entry) => ({
    root: path.join(appPath, entry.name),
    version: parseVersion(entry.name)?.text || null,
    channel: '手动指定',
  }))
}

async function readLinuxVersion(appDir) {
  try {
    const parsed = parseVersion(await fsp.readFile(path.join(appDir, 'version'), 'utf8'))
    if (parsed) return parsed.text
  } catch {
    // 无版本文件时继续查询 dpkg
  }
  const result = await runCommand('dpkg-query', ['-W', '-f=${Version}', 'claude-desktop'], { timeout: 5000 })
  return result.ok ? parseVersion(result.stdout)?.text || null : null
}

async function detectClaudeDesktop(ctx) {
  const { manualPath } = ctx
  const candidates = []
  const seen = new Set()

  async function add(candidate) {
    const key = normalizePath(candidate.root)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(candidate)
  }

  if (manualPath) {
    for (const item of await findManual(manualPath)) await add(item)
  }

  const appxPromise = appxInstances()
  const localRoot = path.join(localAppDataRoot(), 'AnthropicClaude')
  for (const entry of await listDir(localRoot)) {
    if (!entry.isDirectory() || !/^app-\d/.test(entry.name)) continue
    await add({
      root: path.join(localRoot, entry.name),
      version: parseVersion(entry.name)?.text || null,
      channel: '官网安装包',
    })
  }
  for (const item of await appxPromise) {
    const nested = path.join(item.root, 'app')
    await add({
      root: (await isDirectory(nested)) ? nested : item.root,
      version: item.version,
      channel: item.channel,
    })
  }
  if (process.platform === 'linux') {
    await add({ root: '/usr/lib/claude-desktop', version: null, channel: 'deb 包' })
  }

  const instances = []
  const notes = []
  for (const candidate of candidates) {
    const inspected = await inspectDesktopApp(candidate.root, [`安装渠道：${candidate.channel}`])
    if (!inspected.valid) continue
    let version = candidate.version
    let versionSource = version ? '安装目录或包信息' : null
    for (const file of [path.join(candidate.root, 'resources', 'app', 'package.json')]) {
      const pkg = await readJsonSafe(file)
      if (pkg.ok && pkg.value?.version) {
        version = String(pkg.value.version)
        versionSource = 'package.json'
        break
      }
    }
    if (!version && candidate.channel.includes('deb')) {
      version = await readLinuxVersion(candidate.root)
      if (version) versionSource = 'version 文件或 dpkg'
    }
    const instance = {
      id: makeId('claude-desktop', candidate.root),
      toolId: 'claude-desktop',
      form: 'desktop-app',
      formLabel: '桌面应用',
      name: `Claude Desktop${version ? ` ${version}` : ''}`,
      path: candidate.root,
      version,
      versionSource,
      channel: candidate.channel,
      evidence: inspected.evidence,
      localization: inspected.localization,
      warnings: [],
      installed: true,
      capabilities: [
        {
          kind: 'apply',
          enabled: false,
          reason:
            process.platform === 'linux'
              ? 'Linux 汉化需用 sudo 修改系统安装目录并重打包资源，本软件不自动提权；当前仅检测'
              : '该发行版的汉化引擎尚未接入；当前提供真实检测与状态查看',
        },
        {
          kind: 'uninstall',
          enabled: false,
          reason:
            inspected.localization.state === 'external'
              ? '检测到外部汉化，不由本软件管理'
              : '未通过本软件安装汉化',
        },
      ],
    }
    if (candidate.channel.includes('MSIX')) {
      instance.warnings.push('MSIX 安装受系统完整性保护，检测路径可能因权限受限而不完整。')
    }
    instances.push(instance)
  }

  if (!instances.length) {
    notes.push('未在本机已知位置发现 Claude Desktop。')
  }
  return { instances, notes }
}

module.exports = { detectClaudeDesktop, inspectDesktopApp, DESKTOP_MARKERS }
