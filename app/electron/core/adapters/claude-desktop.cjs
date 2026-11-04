'use strict'

const fsp = require('node:fs').promises
const path = require('node:path')
const os = require('node:os')
const {
  exists,
  isDirectory,
  readJsonSafe,
  readAsarEntry,
  listDir,
  fileContainsAny,
  runPowerShell,
  runCommand,
  normalizePath,
  parseVersion,
  makeId,
} = require('../util.cjs')
const { checkCompatibility, describeSource } = require('../external-catalog.cjs')

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
  let zhInBundle = null
  if (ionDistAsar) {
    try {
      zhInBundle = Boolean(await readAsarEntry(path.join(resources, 'ion-dist.asar'), 'i18n/zh-CN.json'))
    } catch {
      zhInBundle = null
    }
  }
  const officialChinese = zhLocale
    ? true
    : ionDistAsar
      ? zhInBundle
      : ionDistDir
        ? await exists(path.join(resources, 'ion-dist', 'i18n', 'zh-CN.json'))
        : null
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
  if (zhInBundle === true) evidence.push('前端词库：ion-dist.asar 内含 i18n/zh-CN.json')
  else if (zhInBundle === false) evidence.push('前端词库：ion-dist.asar 未提供 i18n/zh-CN.json')
  else if (ionDistAsar) evidence.push('前端词库：ion-dist.asar 无法读取，未能确认中文资源')
  evidence.push(...markers)
  evidence.push(...(extra || []))

  let localization
  if (markers.length) {
    localization = {
      state: 'external',
      label: '外部汉化',
      detail: '检测到其他汉化补丁的注入标记，本软件不会覆盖未知改动',
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
  } else if (backupDir) {
    localization = {
      state: 'unknown',
      label: '汉化备份待确认',
      detail: '发现汉化补丁的备份目录，但未检测到注入标记；可能已卸载，或补丁未生效',
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

  return {
    resources,
    localization,
    valid: resourcesExists && (exe || appAsar || ionDistAsar || ionDistDir),
    evidence,
    officialChinese,
    hasMarkers: markers.length > 0,
    backupDir,
    zhLocale,
  }
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

function desktopSupport(channel, officialChinese, compatibility = null) {
  const msix = channel.includes('MSIX')
  const source = describeSource('claude-desktop')
  const chineseDetail =
    officialChinese === true
      ? '当前版本已随包提供简体中文词库，可直接在 Claude Desktop 设置中切换语言。'
      : officialChinese === false
        ? '当前版本未随包提供简体中文词库（ion-dist.asar/i18n 下没有 zh-CN）。'
        : '未能读取前端词库，无法确认当前版本是否自带简体中文。'
  const details = [`安装渠道：${channel}。`]
  if (msix) {
    details.push('MSIX 安装在 WindowsApps 下，目录默认由 TrustedInstaller 控制，普通用户不可写。')
  }
  details.push(chineseDetail)
  details.push(`社区源：${source.repo}@${source.shortCommit}（${source.license ?? '未声明许可证'}）。`)
  if (compatibility?.ok) {
    details.push(
      `已登记源支持 ${source.versionText}。安装时会从 GitHub 下载该固定提交并校验 SHA-256，再运行上游安装器。`,
    )
    details.push(
      '安装需要管理员权限：上游安装器会接管 MSIX 目录所有权、改写 app.asar / ion-dist.asar，并使 Claude Desktop 的 Authenticode 签名失效；这些改动不会自动恢复。',
    )
  } else {
    details.push(`当前实例不满足社区源要求：${compatibility?.reason ?? '未通过兼容性检查'}。`)
    details.push('不会提供下载或写入入口，避免在未知版本上覆盖文件。')
  }
  return {
    summary: compatibility?.ok
      ? '可通过社区汉化源安装：需要 UAC 提权，并使签名失效'
      : `暂不支持写入：${compatibility?.reason ?? '当前渠道未通过社区源兼容性检查'}`,
    details,
    link: {
      label: '查看上游汉化项目（MIT）',
      url: `https://github.com/${source.repo}`,
    },
  }
}

/** 只读检查目标目录是否带有上游补丁标记，用于安装/卸载后的结果验证。 */
async function hasClaudeDesktopPatch(appDir) {
  const resources = path.join(appDir, 'resources')
  for (const asar of ['app.asar', 'ion-dist.asar']) {
    const file = path.join(resources, asar)
    if (!(await exists(file))) continue
    const found = await fileContainsAny(file, DESKTOP_MARKERS)
    if (found.size > 0) return true
  }
  return false
}

/** 根据版本、外部补丁状态与本软件安装记录生成能力，不访问磁盘，便于单独验证。 */
function desktopCapabilities({ external, inspected, version, platform = process.platform }) {
  const sourceInfo = describeSource('claude-desktop')
  const compatibility = checkCompatibility('claude-desktop', { version }, platform)
  const oursInstalled = external?.status === 'installed'
  const hasExisting = Boolean(
    oursInstalled ||
      external?.status === 'failed' ||
      inspected?.hasMarkers ||
      inspected?.backupDir ||
      inspected?.localization?.state === 'external',
  )
  let apply
  if (!compatibility.ok) {
    apply = { kind: 'apply', enabled: false, reason: compatibility.reason }
  } else {
    apply = {
      kind: 'apply',
      enabled: true,
      label: hasExisting ? '重新汉化' : '下载并安装社区汉化',
      reason: `将使用 ${sourceInfo.repo} 执行安装脚本（需要 UAC 提权）`,
    }
  }

  const uninstallEnabled = hasExisting
  return {
    compatibility,
    capabilities: [
      apply,
      {
        kind: 'uninstall',
        enabled: uninstallEnabled,
        reason: uninstallEnabled
          ? '运行上游卸载器并从备份恢复资源'
          : '当前尚未安装汉化',
      },
    ],
  }
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

    const external =
      ctx.external?.instancePath &&
      normalizePath(ctx.external.instancePath) === normalizePath(candidate.root)
        ? ctx.external
        : null
    let localization = inspected.localization
    if (external?.status === 'installed') {
      localization = inspected.hasMarkers
        ? {
            state: 'managed',
            label: '已汉化（社区源）',
            detail: `由本软件调用上游安装器安装（${external.repo}@${String(external.commit).slice(0, 7)}），可通过本软件卸载。`,
            evidence: inspected.evidence,
            coverage: [],
          }
        : {
            state: 'stale',
            label: '汉化记录待确认',
            detail: '本软件有安装记录，但未检测到注入标记；可能已被升级覆盖，可尝试卸载恢复。',
            evidence: inspected.evidence,
            coverage: [],
          }
    } else if (external?.status === 'failed') {
      localization = {
        state: 'stale',
        label: '上次安装未完成',
        detail: '上次社区源安装未成功完成；如已产生改动或备份，可通过本软件尝试恢复。',
        evidence: inspected.evidence,
        coverage: [],
      }
    }

    const { compatibility, capabilities } = desktopCapabilities({ external, inspected, version })
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
      localization,
      warnings: [],
      installed: true,
      capabilities,
      support: desktopSupport(candidate.channel, inspected.officialChinese, compatibility),
    }
    if (candidate.channel.includes('MSIX')) {
      instance.warnings.push('MSIX 安装受系统完整性保护，检测路径可能因权限受限而不完整。')
    }
    instances.push(instance)
  }

  if (!instances.length) {
    notes.push('未在本机已知位置发现 Claude Desktop。')
  } else if (instances.length > 1) {
    notes.push('检测到多个安装目录，上游脚本默认作用于最新可用版本。')
  }
  return { instances, notes }
}

module.exports = {
  detectClaudeDesktop,
  inspectDesktopApp,
  desktopSupport,
  desktopCapabilities,
  hasClaudeDesktopPatch,
  DESKTOP_MARKERS,
}
