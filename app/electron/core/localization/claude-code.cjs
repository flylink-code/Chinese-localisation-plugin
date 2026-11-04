'use strict'

const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const {
  exists,
  isDirectory,
  readJsonSafe,
  writeFileAtomic,
  writeJsonAtomic,
  sha256File,
  listDir,
  makeId,
  stamp,
  normalizePath,
  isInside,
  errorMessage,
} = require('../util.cjs')

const PLUGIN_VERSION_FALLBACK = '0.1.0'
const SUPPORTED_MIN_VERSION = '2.1.287'
const PLUGIN_SOURCE_URL = 'https://github.com/jiangnanquan/claude-code-zh'
const REQUIRED_PATHS = [
  path.join('.claude-plugin', 'plugin.json'),
  path.join('hooks', 'hooks.json'),
  path.join('hooks', 'register.tsx'),
  'dict.json',
]
const COPIED_ENTRIES = ['.claude-plugin', 'hooks', 'dict.json', 'LICENSE']
const MARKER_FILE = '.localiser.json'

function splitPluginDirs(value) {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item.trim())
  if (typeof value === 'string') return value.split(path.delimiter).filter((item) => item.trim())
  throw new Error('CLAUDE_CODE_PLUGIN_DIRS 的格式无法识别，已停止修改')
}

function includesPath(list, target) {
  const wanted = normalizePath(target)
  return list.some((item) => normalizePath(item) === wanted)
}

/** 向 settings 追加插件目录，保留原有值和类型（字符串或数组）。 */
function mergePluginDir(settings, target) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings.json 顶层不是对象，已停止修改')
  }
  const env = settings.env === undefined ? {} : settings.env
  if (!env || typeof env !== 'object' || Array.isArray(env)) {
    throw new Error('settings.json 的 env 不是对象，已停止修改')
  }
  const existing = env.CLAUDE_CODE_PLUGIN_DIRS
  const createdEnvKey = existing === undefined
  const dirs = splitPluginDirs(existing)
  if (!includesPath(dirs, target)) dirs.push(target)
  const next = structuredClone(settings)
  next.env = { ...env }
  next.env.CLAUDE_CODE_PLUGIN_DIRS = Array.isArray(existing) ? dirs : dirs.join(path.delimiter)
  return { settings: next, createdEnvKey, added: createdEnvKey || !includesPath(splitPluginDirs(existing), target) }
}

/** 只移除本软件写入的目录，不恢复整份备份，避免覆盖用户之后的修改。 */
function removePluginDir(settings, target, { createdEnvKey = false, settingsExisted = true } = {}) {
  const next = structuredClone(settings)
  const env = next.env && typeof next.env === 'object' && !Array.isArray(next.env) ? next.env : null
  if (!env) return { settings: next, changed: false, deleteFile: false }
  const existing = env.CLAUDE_CODE_PLUGIN_DIRS
  if (existing === undefined) return { settings: next, changed: false, deleteFile: false }
  const dirs = splitPluginDirs(existing).filter((item) => !includesPath([item], target))
  const changed = dirs.length !== splitPluginDirs(existing).length
  if (dirs.length === 0) {
    if (createdEnvKey || existing === '') delete env.CLAUDE_CODE_PLUGIN_DIRS
    else env.CLAUDE_CODE_PLUGIN_DIRS = Array.isArray(existing) ? [] : ''
  } else {
    env.CLAUDE_CODE_PLUGIN_DIRS = Array.isArray(existing) ? dirs : dirs.join(path.delimiter)
  }
  if (createdEnvKey && Object.keys(env).length === 0) delete next.env
  const deleteFile = !settingsExisted && next.env === undefined && Object.keys(next).length === 0
  return { settings: next, changed, deleteFile }
}

function enabledPluginsMap(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('settings.json 顶层不是对象，已停止修改')
  }
  const map = settings.enabledPlugins
  if (map === undefined) return {}
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('settings.json 的 enabledPlugins 不是对象，已停止修改')
  }
  return map
}

function setPluginEnabled(settings, pluginId, enabled) {
  const map = enabledPluginsMap(settings)
  const next = structuredClone(settings)
  next.enabledPlugins = { ...map, [pluginId]: enabled }
  return next
}

/** 停用外部中文插件；只处理当前确实启用的登记项，并记录原值供卸载时恢复。 */
function disableExternalPlugins(settings, plugins) {
  const map = enabledPluginsMap(settings)
  let next = settings
  const disabled = []
  for (const plugin of plugins) {
    const id = typeof plugin?.id === 'string' ? plugin.id : ''
    if (!id || map[id] === false) continue
    next = setPluginEnabled(next, id, false)
    disabled.push({
      id,
      name: plugin.name || id,
      previous: map[id] === undefined ? null : Boolean(map[id]),
    })
  }
  return { settings: next, disabled }
}

/** 只恢复仍处于停用状态的条目；用户之后手动改过的不覆盖。 */
function restoreExternalPlugins(settings, disabled) {
  if (!disabled?.length) return { settings, restored: [] }
  const map = enabledPluginsMap(settings)
  let next = settings
  const restored = []
  for (const item of disabled) {
    if (!item?.id || map[item.id] !== false) continue
    if (item.previous === null || item.previous === undefined) {
      const copy = structuredClone(next)
      copy.enabledPlugins = { ...map }
      delete copy.enabledPlugins[item.id]
      if (Object.keys(copy.enabledPlugins).length === 0) delete copy.enabledPlugins
      next = copy
    } else {
      next = setPluginEnabled(next, item.id, Boolean(item.previous))
    }
    restored.push(item)
  }
  return { settings: next, restored }
}

function authorName(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value.name === 'string' && value.name.trim()) return value.name.trim()
  return null
}

async function validatePluginSource(sourceDir, { allowCustomName = false } = {}) {
  if (!(await isDirectory(sourceDir))) {
    throw new Error('未找到内置 cc-zh 插件资源，请先在 app 目录运行 npm run sync:plugin')
  }
  for (const relative of REQUIRED_PATHS) {
    if (!(await exists(path.join(sourceDir, relative)))) {
      throw new Error(`内置插件缺少文件：${relative}`)
    }
  }
  const manifest = await readJsonSafe(path.join(sourceDir, '.claude-plugin', 'plugin.json'))
  if (!manifest.ok || (!allowCustomName && manifest.value?.name !== 'cc-zh') || !manifest.value?.name) {
    throw new Error('内置插件清单无效，已停止操作')
  }
  return {
    version: String(manifest.value.version || PLUGIN_VERSION_FALLBACK),
    name: String(manifest.value.name),
    author: authorName(manifest.value.author),
    license: typeof manifest.value.license === 'string' ? manifest.value.license : null,
    sourceUrl: PLUGIN_SOURCE_URL,
  }
}

async function copyPlugin(sourceDir, targetDir) {
  const parent = path.dirname(targetDir)
  await fsp.mkdir(parent, { recursive: true })
  const staging = path.join(parent, `.cc-zh.staging-${process.pid}-${Date.now()}`)
  await fsp.rm(staging, { recursive: true, force: true })
  await fsp.mkdir(staging, { recursive: true })
  try {
    for (const entry of COPIED_ENTRIES) {
      const from = path.join(sourceDir, entry)
      if (await exists(from)) {
        await fsp.cp(from, path.join(staging, entry), { recursive: true, errorOnExist: false })
      }
    }
    await writeJsonAtomic(path.join(staging, MARKER_FILE), {
      managedBy: 'chinese-localiser',
      tool: 'claude-code',
      copiedAt: new Date().toISOString(),
    })
    let previous = null
    if (await exists(targetDir)) {
      const marker = await readJsonSafe(path.join(targetDir, MARKER_FILE))
      if (!marker.ok || marker.value?.managedBy !== 'chinese-localiser') {
        throw new Error('目标插件目录已存在且不是本软件创建的，已停止覆盖')
      }
      previous = `${targetDir}.old-${stamp()}`
      await fsp.rename(targetDir, previous)
    }
    try {
      await fsp.rename(staging, targetDir)
    } catch (error) {
      if (previous) await fsp.rename(previous, targetDir).catch(() => {})
      throw error
    }
    if (previous) await fsp.rm(previous, { recursive: true, force: true }).catch(() => {})
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

function createClaudeCodeLocalization(options) {
  const {
    settingsPath,
    pluginRoot,
    backupRoot,
    sourcePluginDir,
    stateStore,
    historyStore,
  } = options
  const pluginTarget = path.join(pluginRoot, 'cc-zh')

  function backupDirNow() {
    return path.join(backupRoot, 'claude-code', stamp())
  }

  async function backupSettings() {
    const dir = backupDirNow()
    await fsp.mkdir(dir, { recursive: true })
    const settingsExisted = await exists(settingsPath)
    let hash = null
    if (settingsExisted) {
      await fsp.copyFile(settingsPath, path.join(dir, 'settings.json'))
      hash = await sha256File(settingsPath)
    }
    await writeJsonAtomic(path.join(dir, 'manifest.json'), {
      createdAt: new Date().toISOString(),
      settingsPath,
      settingsExisted,
      sha256: hash,
      pluginTarget,
    })
    return { dir, settingsExisted }
  }

  function coverage() {
    return [
      '斜杠命令说明、/config 项、Spinner 提示、提示行与通知',
      '工具调用摘要、回合结束行、命令输出等插件已接线的位置',
      '不覆盖权限确认对话框、欢迎屏、错误信息与 CLI --help',
      '汉化通过 Claude Code 官方插件扩展点加载，不修改程序文件',
    ]
  }

  async function sourceInfo() {
    return validatePluginSource(sourcePluginDir)
  }

  async function preview(action, instance, externalPlugins = []) {
    const info = await sourceInfo()
    const state = (await stateStore.read()).claudeCode
    const takeover = (externalPlugins || []).filter((item) => item?.id)
    const warnings = [
      '该设置写入当前用户的 ~/.claude/settings.json，会影响本机所有 Claude Code CLI 会话。',
      '插件只覆盖部分界面文案，未接入的位置仍显示英文。',
      '需要重新启动 Claude Code 或开启新会话后生效。',
    ]
    if (takeover.length) {
      warnings.push(
        `将停用外部中文插件 ${takeover.map((item) => item.name).join('、')}；插件文件不会删除，也不撤销它对 Claude Code 程序文件做过的修改，卸载汉化时恢复启用状态。`,
      )
    }
    if (action === 'apply') {
      const changes = [
        { file: pluginTarget, action: 'create', summary: '复制 cc-zh 插件（官方插件扩展点）' },
        {
          file: settingsPath,
          action: 'update',
          summary: '在 env.CLAUDE_CODE_PLUGIN_DIRS 中追加插件目录，保留其他条目',
        },
      ]
      if (takeover.length) {
        changes.push({
          file: settingsPath,
          action: 'update',
          summary: `停用外部中文插件 ${takeover.map((item) => item.name).join('、')}，记录原值以便卸载时恢复`,
        })
      }
      changes.push({
        file: '应用数据目录/backups/claude-code/<时间>/',
        action: 'create',
        summary: '修改前备份 settings.json',
      })
      return {
        action,
        title: takeover.length ? '替换外部汉化为内置汉化' : '应用 Claude Code 汉化',
        instancePath: instance?.path || null,
        pluginVersion: info.version,
        requirements: [`Claude Code CLI ≥ ${SUPPORTED_MIN_VERSION}`],
        changes,
        coverage: coverage(),
        warnings,
        takeover: takeover.length > 0,
      }
    }
    if (action === 'uninstall') {
      if (!state) throw new Error('没有找到本软件的安装记录，无法卸载汉化')
      const changes = [
        {
          file: settingsPath,
          action: 'update',
          summary: '仅移除本软件写入的插件目录，保留其他插件与用户设置',
        },
        { file: pluginTarget, action: 'delete', summary: '删除本软件复制的插件目录' },
        { file: '应用数据目录/backups/claude-code/', action: 'keep', summary: '保留历史备份，供手动恢复' },
      ]
      const disabled = Array.isArray(state.disabledPlugins) ? state.disabledPlugins : []
      if (disabled.length) {
        changes.push({
          file: settingsPath,
          action: 'update',
          summary: `恢复此前停用的外部中文插件 ${disabled.map((item) => item.name || item.id).join('、')}`,
        })
      }
      return {
        action,
        title: '卸载 Claude Code 汉化',
        instancePath: state.instancePath || instance?.path || null,
        pluginVersion: info.version,
        requirements: [],
        changes,
        coverage: ['恢复英文界面'],
        warnings: ['需要重新启动 Claude Code 或开启新会话后生效。'],
      }
    }
    throw new Error('不支持的操作')
  }

  async function apply(instance, { externalPlugins = [], customPluginDir = null, repo = null, takeoverExternal = true } = {}) {
    let backup = null
    try {
      const effectiveSourceDir = customPluginDir || sourcePluginDir
      await validatePluginSource(effectiveSourceDir, { allowCustomName: Boolean(customPluginDir) })
      const prevState = (await stateStore.read()).claudeCode
      const settingsExisted = await exists(settingsPath)
      const parsed = settingsExisted
        ? await readJsonSafe(settingsPath)
        : { ok: true, value: {} }
      if (!parsed.ok) {
        throw new Error('settings.json 不是有效 JSON（可能包含注释），为避免破坏配置已停止')
      }
      backup = await backupSettings()
      const merged = mergePluginDir(parsed.value, pluginTarget)
      const shouldTakeover = takeoverExternal !== false && externalPlugins.length > 0
      const takeover = shouldTakeover
        ? disableExternalPlugins(merged.settings, externalPlugins)
        : { settings: merged.settings, disabled: [] }
      await copyPlugin(effectiveSourceDir, pluginTarget)
      try {
        await writeFileAtomic(settingsPath, `${JSON.stringify(takeover.settings, null, 2)}\n`)
      } catch (error) {
        if (!prevState) {
          await fsp.rm(pluginTarget, { recursive: true, force: true }).catch(() => {})
        }
        throw error
      }
      const verify = await readJsonSafe(settingsPath)
      const dirs = verify.ok ? splitPluginDirs(verify.value?.env?.CLAUDE_CODE_PLUGIN_DIRS) : []
      if (!verify.ok || !includesPath(dirs, pluginTarget)) {
        throw new Error('写入后校验失败：settings.json 未包含插件目录')
      }
      const stillEnabled = takeover.disabled.filter(
        (item) => verify.value?.enabledPlugins?.[item.id] !== false,
      )
      if (stillEnabled.length) {
        throw new Error(`写入后校验失败：外部插件仍未停用（${stillEnabled.map((item) => item.name).join('、')}）`)
      }
      const manifest = await readJsonSafe(path.join(effectiveSourceDir, '.claude-plugin', 'plugin.json'))
      const combinedDisabled = [...(prevState?.disabledPlugins || [])]
      for (const item of takeover.disabled) {
        if (!combinedDisabled.some((prev) => prev.id === item.id)) {
          combinedDisabled.push(item)
        }
      }
      await stateStore.setClaudeCode({
        pluginTarget,
        settingsPath,
        instancePath: instance?.path || null,
        instanceId: instance?.id || null,
        installedAt: new Date().toISOString(),
        pluginVersion: String(manifest.value?.version || PLUGIN_VERSION_FALLBACK),
        repo: repo || 'jiangnanquan/claude-code-zh',
        backupDir: backup.dir,
        settingsExisted: prevState ? Boolean(prevState.settingsExisted) : backup.settingsExisted,
        createdEnvKey: prevState ? Boolean(prevState.createdEnvKey) : merged.createdEnvKey,
        disabledPlugins: combinedDisabled,
      })
      const entry = {
        id: makeId('apply', Date.now()),
        at: new Date().toISOString(),
        action: 'apply',
        toolId: 'claude-code',
        toolName: 'Claude Code',
        instancePath: instance?.path || null,
        result: 'success',
        summary: takeover.disabled.length
          ? `已复制 cc-zh 插件并写入用户级插件目录配置，停用外部插件 ${takeover.disabled.map((item) => item.name).join('、')}`
          : '已复制 cc-zh 插件并写入用户级插件目录配置',
      }
      await historyStore.append(entry)
      return { ok: true, message: 'Claude Code 汉化配置已生效，请重新启动 Claude Code 或开启新会话。', backupDir: backup.dir }
    } catch (error) {
      await historyStore
        .append({
          id: makeId('apply', Date.now()),
          at: new Date().toISOString(),
          action: 'apply',
          toolId: 'claude-code',
          toolName: 'Claude Code',
          instancePath: instance?.path || null,
          result: 'failed',
          summary: errorMessage(error),
        })
        .catch(() => {})
      throw error
    }
  }

  async function uninstall() {
    const state = (await stateStore.read()).claudeCode
    if (!state) throw new Error('没有找到本软件的安装记录，无法卸载汉化')
    if (!isInside(pluginRoot, state.pluginTarget) || state.pluginTarget !== pluginTarget) {
      throw new Error('安装记录中的插件目录异常，已停止操作')
    }
    if (normalizePath(state.settingsPath) !== normalizePath(settingsPath)) {
      throw new Error('安装记录中的配置文件路径异常，已停止操作')
    }
    const parsed = await readJsonSafe(settingsPath)
    if (!parsed.ok) {
      throw new Error('settings.json 不是有效 JSON，已停止卸载以避免破坏配置')
    }
    await backupSettings()
    const removal = removePluginDir(parsed.value, pluginTarget, {
      createdEnvKey: Boolean(state.createdEnvKey),
      settingsExisted: Boolean(state.settingsExisted),
    })
    const restored = removal.deleteFile
      ? { settings: removal.settings, restored: [] }
      : restoreExternalPlugins(removal.settings, state.disabledPlugins)
    if (removal.deleteFile) {
      await fsp.rm(settingsPath, { force: true })
    } else if (removal.changed || state.createdEnvKey || restored.restored.length) {
      await writeFileAtomic(settingsPath, `${JSON.stringify(restored.settings, null, 2)}\n`)
    }
    if (await exists(pluginTarget)) {
      const marker = await readJsonSafe(path.join(pluginTarget, MARKER_FILE))
      if (!marker.ok || marker.value?.managedBy !== 'chinese-localiser') {
        throw new Error('插件目录不是本软件创建的，已保留未删除')
      }
      await fsp.rm(pluginTarget, { recursive: true, force: true })
    }
    await stateStore.setClaudeCode(null)
    await historyStore.append({
      id: makeId('uninstall', Date.now()),
      at: new Date().toISOString(),
      action: 'uninstall',
      toolId: 'claude-code',
      toolName: 'Claude Code',
      instancePath: state.instancePath || null,
      result: 'success',
      summary: restored.restored.length
        ? `已移除本软件写入的插件目录配置，并恢复外部插件 ${restored.restored.map((item) => item.name).join('、')}`
        : '已移除本软件写入的插件目录配置，原英文界面恢复',
    })
    return {
      ok: true,
      message: restored.restored.length
        ? '汉化已卸载，外部中文插件已恢复启用；请重新启动 Claude Code 或开启新会话。'
        : '汉化已卸载，请重新启动 Claude Code 或开启新会话。',
    }
  }

  async function inspect() {
    const state = (await stateStore.read()).claudeCode
    const pluginFiles = await listDir(pluginTarget)
    const marker = await readJsonSafe(path.join(pluginTarget, MARKER_FILE))
    const settings = await readJsonSafe(settingsPath)
    const dirs = settings.ok ? splitPluginDirs(settings.value?.env?.CLAUDE_CODE_PLUGIN_DIRS) : []
    return {
      state,
      pluginPresent: pluginFiles.length > 0,
      managedMarker: marker.ok && marker.value?.managedBy === 'chinese-localiser',
      configured: includesPath(dirs, pluginTarget),
      allDirs: dirs,
      settingsExists: await exists(settingsPath),
      settingsReadable: settings.ok,
    }
  }

  return {
    pluginTarget,
    settingsPath,
    preview,
    apply,
    uninstall,
    inspect,
    sourceInfo,
    coverage,
    constants: { SUPPORTED_MIN_VERSION },
  }
}

module.exports = {
  createClaudeCodeLocalization,
  mergePluginDir,
  removePluginDir,
  splitPluginDirs,
  includesPath,
  disableExternalPlugins,
  restoreExternalPlugins,
  validatePluginSource,
  SUPPORTED_MIN_VERSION,
  COPIED_ENTRIES,
}
