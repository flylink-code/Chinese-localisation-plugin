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
  readAsarEntry,
  runPowerShell,
  normalizePath,
  makeId,
} = require('../util.cjs')
const { checkCompatibility, describeSource } = require('../external-catalog.cjs')

const ANTIGRAVITY_MARKERS = ['__ANTIGRAVITY_CHINESE_LOCALIZATION_START__']

function localRoots() {
  const home = os.homedir()
  if (process.platform !== 'win32') {
    return [
      path.join(home, '.local', 'share', 'antigravity'),
      path.join(home, '.local', 'share', 'Antigravity'),
      path.join(
        home,
        '.local',
        'share',
        'flatpak',
        'app',
        'com.antigravity',
        'current',
        'active',
        'files',
        'share',
        'antigravity',
      ),
      '/opt/antigravity',
      '/opt/Antigravity',
      '/usr/local/share/antigravity',
      '/usr/local/share/Antigravity',
      '/usr/share/antigravity',
      '/usr/share/Antigravity',
      '/snap/antigravity/current/usr/share/antigravity',
    ]
  }
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  return [
    path.join(local, 'Programs', 'Antigravity'),
    path.join(local, 'Antigravity'),
    path.join(local, 'Programs', 'antigravity'),
    path.join(programFiles, 'Antigravity'),
    path.join(programFiles, 'Antigravity', 'resources'),
  ]
}

async function registryEntries() {
  if (process.platform !== 'win32') return []
  const script = [
    "$roots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
    'Get-ItemProperty $roots -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "Antigravity" } | Select-Object DisplayName, DisplayVersion, InstallLocation | ConvertTo-Json -Compress',
  ].join('; ')
  const result = await runPowerShell(script, { timeout: 12000 })
  if (!result.ok || !result.stdout.trim()) return []
  try {
    const parsed = JSON.parse(result.stdout.trim())
    const items = Array.isArray(parsed) ? parsed : [parsed]
    return items.filter((item) => item?.InstallLocation)
  } catch {
    return []
  }
}

async function resolveAppDir(value) {
  if (value.toLowerCase().endsWith('app.asar')) {
    const resources = path.dirname(value)
    return (await exists(value)) && (await isDirectory(resources)) ? path.dirname(resources) : null
  }
  const stat = await fsp.stat(value).catch(() => null)
  if (!stat) return null
  if (stat.isFile()) return null
  if (path.basename(value).toLowerCase() === 'resources') {
    return (await exists(path.join(value, 'app.asar'))) ? path.dirname(value) : null
  }
  if (await exists(path.join(value, 'resources', 'app.asar'))) return value
  if (await isDirectory(path.join(value, 'resources', 'app'))) return value
  const entries = await listDir(value)
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const nested = path.join(value, entry.name)
    if (
      (await exists(path.join(nested, 'resources', 'app.asar'))) ||
      (await isDirectory(path.join(nested, 'resources', 'app')))
    ) {
      return nested
    }
  }
  return null
}

async function readVersion(appDir) {
  const candidates = [
    path.join(appDir, 'resources', 'app', 'product.json'),
    path.join(appDir, 'resources', 'app', 'package.json'),
  ]
  for (const file of candidates) {
    const json = await readJsonSafe(file)
    if (json.ok && json.value?.version) return { version: String(json.value.version), source: path.basename(file) }
  }
  const asar = path.join(appDir, 'resources', 'app.asar')
  if (await exists(asar)) {
    for (const entry of ['package.json', 'product.json']) {
      try {
        const buffer = await readAsarEntry(asar, entry)
        if (!buffer) continue
        const parsed = JSON.parse(buffer.toString('utf8'))
        if (parsed?.version) return { version: String(parsed.version), source: `app.asar/${entry}` }
      } catch {
        // ASAR 结构异常时保持版本未知，不影响只读检测
      }
    }
  }
  return { version: null, source: null }
}

async function inspectApp(appDir, channel) {
  const resources = path.join(appDir, 'resources')
  const asar = path.join(resources, 'app.asar')
  const hasAsar = await exists(asar)
  const hasUnpacked = await isDirectory(path.join(resources, 'app'))
  if (!hasAsar && !hasUnpacked) return null

  const evidence = [`安装目录：${appDir}`, `安装渠道：${channel}`]
  const markers = []
  if (hasAsar) {
    const found = await fileContainsAny(asar, ANTIGRAVITY_MARKERS)
    for (const marker of found) markers.push(`app.asar 含注入标记 ${marker}`)
  }
  const backup = await exists(path.join(resources, 'app.asar.bak'))
  if (backup) evidence.push('发现 app.asar.bak 备份')
  evidence.push(...markers)

  let localization
  if (markers.length) {
    localization = {
      state: 'external',
      label: '外部汉化',
      detail: 'app.asar 中存在汉化注入标记，可能由其他工具安装',
      evidence,
      coverage: [],
    }
  } else if (backup) {
    localization = {
      state: 'unknown',
      label: '备份待确认',
      detail: '发现 app.asar.bak，但没有可确认的汉化注入标记',
      evidence,
      coverage: [],
    }
  } else if (!hasAsar) {
    localization = {
      state: 'unknown',
      label: '资源待确认',
      detail: '未找到 app.asar，无法确认汉化状态',
      evidence,
      coverage: [],
    }
  } else {
    localization = {
      state: 'none',
      label: '未汉化',
      detail: '未检测到汉化注入标记或备份',
      evidence,
      coverage: [],
    }
  }

  return { resources, localization, evidence, hasMarkers: markers.length > 0, hasBackup: backup, hasAsar }
}

/** 只读检查目标目录是否带有上游补丁标记，用于安装/卸载后的结果验证。 */
async function hasAntigravityPatch(appDir) {
  const asar = path.join(appDir, 'resources', 'app.asar')
  if (!(await exists(asar))) return false
  const found = await fileContainsAny(asar, ANTIGRAVITY_MARKERS)
  return found.size > 0
}

async function detectAntigravity(ctx) {
  const { manualPath } = ctx
  const roots = []
  const seen = new Set()
  async function add(root, channel) {
    if (!root) return
    const resolved = await resolveAppDir(root)
    if (!resolved) return
    const key = normalizePath(resolved)
    if (seen.has(key)) return
    seen.add(key)
    roots.push({ appDir: resolved, channel })
  }

  if (manualPath) await add(manualPath, '手动指定')
  const registryPromise = registryEntries()
  for (const root of localRoots()) await add(root, '默认安装位置')
  for (const entry of await registryPromise) {
    await add(String(entry.InstallLocation), '安装登记（注册表）')
  }

  const instances = []
  const notes = []
  for (const item of roots) {
    const inspected = await inspectApp(item.appDir, item.channel)
    if (!inspected) continue
    const versionInfo = await readVersion(item.appDir)
    const external =
      ctx.external?.instancePath &&
      normalizePath(ctx.external.instancePath) === normalizePath(item.appDir)
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

    const sourceInfo = describeSource('antigravity')
    const compatibility = checkCompatibility('antigravity', { version: versionInfo.version })
    const oursInstalled = external?.status === 'installed'
    const hasExisting = Boolean(
      oursInstalled ||
        external?.status === 'failed' ||
        inspected.hasMarkers ||
        inspected.hasBackup ||
        inspected.localization.state === 'external',
    )
    let applyCapability
    if (!compatibility.ok) {
      applyCapability = { kind: 'apply', enabled: false, reason: compatibility.reason }
    } else {
      applyCapability = {
        kind: 'apply',
        enabled: true,
        label: hasExisting ? '重新汉化' : '下载并安装社区汉化',
        reason: `将使用 ${sourceInfo.repo} 执行汉化脚本`,
      }
    }

    const uninstallEnabled = hasExisting
    const warnings = versionInfo.version ? [] : ['未能读取应用版本，界面仅显示检测结果。']
    if (!compatibility.ok) warnings.push(`社区源不可用：${compatibility.reason}`)
    instances.push({
      id: makeId('antigravity', item.appDir),
      toolId: 'antigravity',
      form: 'desktop-app',
      formLabel: '桌面应用',
      name: `Antigravity${versionInfo.version ? ` ${versionInfo.version}` : ''}`,
      path: item.appDir,
      version: versionInfo.version,
      versionSource: versionInfo.source,
      channel: item.channel,
      evidence: inspected.evidence,
      localization,
      warnings,
      installed: true,
      capabilities: [
        applyCapability,
        {
          kind: 'uninstall',
          enabled: uninstallEnabled,
          reason: uninstallEnabled
            ? '运行上游还原脚本并从 app.asar.bak 恢复'
            : '当前尚未安装汉化',
        },
      ],
      support: {
        summary: compatibility.ok
          ? `已绑定 GitHub 汉化仓库 ${sourceInfo.repo}`
          : `暂不支持写入：${compatibility.reason}`,
        details: [
          `安装渠道：${item.channel}。`,
          `GitHub 仓库：${sourceInfo.repo}@${sourceInfo.branch}（${sourceInfo.versionText}）。`,
        ],
        link: {
          label: '打开 GitHub 仓库主页',
          url: `https://github.com/${sourceInfo.repo}`,
        },
      },
    })
  }

  if (!instances.length) {
    notes.push('未在本机已知位置发现 Antigravity。')
  }
  return { instances, notes }
}

module.exports = {
  detectAntigravity,
  ANTIGRAVITY_MARKERS,
  resolveAppDir,
  hasAntigravityPatch,
}
