'use strict'

const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const crypto = require('node:crypto')
const tar = require('tar')
const { exists, normalizePath, stamp } = require('./util.cjs')
const { sourceFor, describeSource, checkCompatibility, archiveUrl, shortCommit } = require('./external-catalog.cjs')

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function sameInstance(state, instance) {
  if (!state?.instancePath || !instance?.path) return false
  return normalizePath(state.instancePath) === normalizePath(instance.path)
}

/** 拒绝绝对路径、目录穿越与链接/设备条目，防止归档逃逸出目标目录。 */
function isSafeEntry(entryPath, entry) {
  const raw = String(entryPath).replace(/\\/g, '/')
  if (raw.split('/').includes('..')) return false
  const normalized = path.posix.normalize(raw)
  if (!normalized || normalized === '.' || normalized === '..') return false
  if (normalized.startsWith('../') || normalized.startsWith('/')) return false
  if (/^[a-zA-Z]:/.test(normalized)) return false
  const type = entry?.type
  if (type === 'SymbolicLink' || type === 'Link') return false
  if (type === 'CharacterDevice' || type === 'BlockDevice' || type === 'FIFO') return false
  return true
}

async function safeExtract(archivePath, destDir) {
  await fsp.mkdir(destDir, { recursive: true })
  await tar.x({
    file: archivePath,
    cwd: destDir,
    strip: 1,
    strict: true,
    preservePaths: false,
    filter: isSafeEntry,
  })
}

/** 解压后确认入口文件存在；若声明了许可证且文件存在则核对标识。 */
async function verifyLayout(source, dir) {
  const entryPath = path.join(dir, ...source.entry.split('/'))
  if (!(await exists(entryPath))) {
    throw new Error(`仓库 ${source.repo} 中未找到入口文件 ${source.entry}，请检查仓库地址或入口配置`)
  }
  if (source.uninstallEntry) {
    const uninstallPath = path.join(dir, ...source.uninstallEntry.split('/'))
    if (!(await exists(uninstallPath))) {
      throw new Error(`仓库 ${source.repo} 中未找到恢复脚本 ${source.uninstallEntry}，请检查恢复入口配置`)
    }
  }
  if (source.license) {
    const licensePath = path.join(dir, source.license.file)
    const text = await fsp.readFile(licensePath, 'utf8').catch(() => '')
    if (!text || !new RegExp(source.license.marker, 'i').test(text)) {
      throw new Error(`社区源缺少可识别的 ${source.license.spdx} 许可证文件，已停止`)
    }
  }
  return { entryPath }
}

function psQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function substitutePathToken(args, instancePath) {
  let replaced = false
  const out = (args || []).map((item) => {
    const str = String(item)
    if (str.includes('{path}')) {
      replaced = true
      return str.split('{path}').join(instancePath || '')
    }
    return str
  })
  return { args: out, replaced }
}

async function readLogTail(logPath, limit = 1200) {
  let handle
  try {
    const stat = await fsp.stat(logPath)
    const start = Math.max(0, stat.size - 64 * 1024)
    handle = await fsp.open(logPath, 'r')
    const buffer = Buffer.alloc(stat.size - start)
    await handle.read(buffer, 0, buffer.length, start)
    const lines = buffer
      .toString('utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return lines.slice(-8).join(' ').slice(-limit)
  } catch {
    return ''
  } finally {
    await handle?.close()
  }
}

function exitReason(outcome) {
  if (outcome.error?.message) return outcome.error.message
  if (outcome.code === 1223) return '已取消管理员权限请求'
  if (typeof outcome.code === 'number') return `上游脚本退出码 ${outcome.code}`
  return '未知错误'
}

function createExternalSources({
  rootDir,
  logDir,
  download,
  runElevated,
  runPowerShell,
  runNode,
  isRunning,
  currentUser,
  hasPatch,
  preferLatestBranch = false,
  platform = process.platform,
  now = () => new Date(),
}) {
  function repoKey(source) {
    const slug = String(source.repo || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_')
    const ref = source.commit && !preferLatestBranch ? source.commit : source.branch || 'main'
    return path.join(rootDir, source.id, `${slug}-${ref}`)
  }

  function sourceDir(source) {
    if (source.commit && !preferLatestBranch && !source.custom) {
      return path.join(rootDir, source.id, source.commit)
    }
    return repoKey(source)
  }

  function markerFile(source) {
    return path.join(sourceDir(source), '.source.json')
  }

  function logPathFor(source, action, stampValue) {
    return path.join(logDir, `${source.id}-${action}-${stampValue}.log`)
  }

  function readMarkerSync(source) {
    try {
      const dir = sourceDir(source)
      const raw = fs.readFileSync(path.join(dir, '.source.json'), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed.repo !== source.repo) return null
      if (!fs.existsSync(path.join(dir, ...source.entry.split('/')))) return null
      return parsed
    } catch {
      return null
    }
  }

  async function readMarker(source) {
    const raw = await fsp.readFile(markerFile(source), 'utf8').catch(() => null)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (parsed.repo === source.repo) {
        if (source.archiveSha256 && !preferLatestBranch && parsed.archiveSha256 !== source.archiveSha256) {
          return null
        }
        return parsed
      }
    } catch {
      // 标记损坏时按未下载处理，重新拉取归档
    }
    return null
  }

  async function ensureSource(source, onPhase, { forceSync = false } = {}) {
    const dir = sourceDir(source)
    if (!forceSync) {
      const marker = await readMarker(source)
      if (marker) {
        const hasMain = await exists(path.join(dir, ...source.entry.split('/')))
        const hasUninstall =
          !source.uninstallEntry || (await exists(path.join(dir, ...source.uninstallEntry.split('/'))))
        if (hasMain && hasUninstall) return { dir, marker }
        throw new Error(`已缓存的仓库缺少入口文件 ${source.entry}；请点击「同步最新」重新拉取`)
      }
    }

    const useBranch = forceSync || preferLatestBranch || !source.commit
    const refLabel = useBranch ? source.branch || 'main' : shortCommit(source.commit)
    onPhase?.({
      phase: 'download',
      message: `正在从 GitHub 同步 ${source.repo}@${refLabel}…`,
    })
    const url = archiveUrl(source, { useBranch })
    const buffer = await download(url)
    if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('仓库归档体积异常，已停止')
    const actual = sha256(buffer)
    if (!useBranch && source.archiveSha256 && actual !== source.archiveSha256) {
      throw new Error(`社区源归档 SHA-256 校验失败（期望 ${source.archiveSha256}，实际 ${actual}），已停止`)
    }

    onPhase?.({ phase: 'extract', message: '正在解压并验证仓库入口文件…' })
    const parent = path.dirname(dir)
    await fsp.mkdir(parent, { recursive: true })
    const suffix = `${process.pid}-${Date.now()}`
    const tempDir = path.join(parent, `.extract-${suffix}`)
    const tempArchive = path.join(parent, `.archive-${suffix}`)
    await fsp.writeFile(tempArchive, buffer, { mode: 0o600 })
    try {
      await safeExtract(tempArchive, tempDir)
      await verifyLayout(source, tempDir)
      await fsp.rm(dir, { recursive: true, force: true })
      await fsp.rename(tempDir, dir)
    } finally {
      await fsp.rm(tempArchive, { force: true })
      await fsp.rm(tempDir, { recursive: true, force: true })
    }

    const record = {
      repo: source.repo,
      branch: source.branch || 'main',
      commit: useBranch ? actual.slice(0, 12) : source.commit,
      archiveSha256: actual,
      extractedAt: now().toISOString(),
    }
    await fsp.writeFile(markerFile(source), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
    return { dir, marker: record }
  }

  async function sync(toolId, { override = null, onPhase } = {}) {
    const source = sourceFor(toolId, override)
    if (!source) throw new Error('该工具尚未配置 GitHub 汉化仓库')
    const { dir, marker } = await ensureSource(source, onPhase, { forceSync: true })
    return {
      dir,
      marker,
      message: `已同步最新仓库 ${source.repo}@${source.branch || 'main'}（${marker.archiveSha256.slice(0, 8)}）`,
    }
  }

  async function writeElevatedLauncher({ source, dir, entryRel, actionName, scriptArgs, user, stampValue }) {
    const logPath = logPathFor(source, actionName, stampValue)
    const launcherPath = path.join(logDir, `${source.id}-${actionName}-${stampValue}.ps1`)
    const scriptPath = path.join(dir, ...(entryRel || source.entry).split('/'))
    const passClaudeDesktopContext =
      source.id === 'claude-desktop' && (entryRel || source.entry).endsWith('install_windows.ps1')
    const contextTail = passClaudeDesktopContext
      ? ` -AllowTakeOwnership -OriginalUserSid ${psQuote(user.sid)} -OriginalUserProfile ${psQuote(user.userProfile)} -OriginalAppData ${psQuote(user.appData)} -OriginalLocalAppData ${psQuote(user.localAppData)}`
      : ''
    const formattedArgs = scriptArgs.length ? ` ${scriptArgs.map(psQuote).join(' ')}` : ''
    const content = `﻿# 由汉化管家生成：以管理员权限调用已校验的上游安装器
param([switch]$Elevated)
if (-not $Elevated) {
    $self = $MyInvocation.MyCommand.Path
    try {
        $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $self + '"'), '-Elevated') -Verb RunAs -Wait -PassThru
        if ($null -eq $proc.ExitCode) { exit 1 }
        exit $proc.ExitCode
    } catch {
        Write-Error $_
        exit 1223
    }
}
$ErrorActionPreference = 'Continue'
$env:CLAUDE_ZH_SKIP_UPDATE_CHECK = '1'
Start-Transcript -Path ${psQuote(logPath)} -Force | Out-Null
$installerExit = 0
try {
    & ${psQuote(scriptPath)}${formattedArgs}${contextTail}
    if ($null -ne $LASTEXITCODE) { $installerExit = $LASTEXITCODE }
} finally {
    try { Stop-Transcript | Out-Null } catch { }
}
exit $installerExit
`
    await fsp.mkdir(path.dirname(launcherPath), { recursive: true })
    await fsp.writeFile(launcherPath, content, 'utf8')
    return { path: launcherPath, logPath }
  }

  function buildNodeArgs(source, action, instance, options = {}) {
    const merged = { ...(source.defaultOptions || {}), ...(options || {}) }
    const entryRel = action === 'uninstall' && source.uninstallEntry ? source.uninstallEntry : source.entry
    const rawArgs =
      action === 'install'
        ? [...(source.installArgs || [])]
        : [
            ...(source.uninstallArgs?.length
              ? source.uninstallArgs
              : source.uninstallEntry
                ? []
                : ['--huifu']),
          ]
    const { args: baseArgs, replaced } = substitutePathToken(rawArgs, instance?.path || '')
    const args = [...baseArgs]
    // localization_engine.js 规范脚本使用 --install-dir 接收路径；其他脚本可通过 {path} 占位符或自动探测
    if (!replaced && instance?.path && String(entryRel).endsWith('localization_engine.js')) {
      args.push('--install-dir', instance.path)
    }
    if (action === 'install' && merged.brandTitle && merged.brandTitle !== 'english') {
      args.push('--brand-title', String(merged.brandTitle))
    }
    const noKill = merged.autoCloseProcess === false
    if (
      noKill &&
      String(entryRel).endsWith('localization_engine.js') &&
      !args.includes('--no-kill')
    ) {
      args.push('--no-kill')
    }
    return { args, noKill, entryRel }
  }

  function buildPowerShellArgs(source, action, instance, options = {}) {
    const merged = { ...(source.defaultOptions || {}), ...(options || {}) }
    const lang = String(merged.language || source.language || 'zh-CN')
    const entryRel = action === 'uninstall' && source.uninstallEntry ? source.uninstallEntry : source.entry
    const isDesktopDefault =
      source.id === 'claude-desktop' && String(entryRel).endsWith('install_windows.ps1')
    let rawArgs
    if (action === 'install') {
      rawArgs = isDesktopDefault ? ['install', lang] : [...(source.installArgs || [])]
    } else if (action === 'uninstall') {
      rawArgs = isDesktopDefault
        ? ['uninstall', lang]
        : [...(source.uninstallArgs?.length ? source.uninstallArgs : source.uninstallEntry ? [] : ['uninstall'])]
    } else {
      const extra = (source.extraActions || []).find((item) => item.id === action)
      rawArgs = extra ? [...extra.args] : [action]
    }
    const { args } = substitutePathToken(rawArgs, instance?.path || '')
    return { args, entryRel }
  }

  async function assertCanOperate(source, options = {}) {
    const merged = { ...(source.defaultOptions || {}), ...(options || {}) }
    const shouldBlock = source.blockWhenRunning || (source.processNames?.length > 0 && merged.autoCloseProcess === false)
    if (!shouldBlock) return
    const running = await isRunning(source.processNames)
    if (running) {
      throw new Error(`请先完全退出 ${source.toolName}，或在卡片上开启「自动关闭运行中客户端」后再试`)
    }
  }

  async function runInstaller({ source, dir, action, instance, options = {}, stampValue, onPhase }) {
    if (source.runner === 'powershell' || source.elevated) {
      const { args: scriptArgs, entryRel } = buildPowerShellArgs(source, action, instance, options)
      if (source.elevated) {
        const user = await currentUser()
        const launcher = await writeElevatedLauncher({
          source,
          dir,
          entryRel,
          actionName: action,
          scriptArgs,
          user,
          stampValue,
        })
        onPhase?.({
          phase: 'elevate',
          message: '正在请求管理员权限（请在弹出的 UAC 窗口点击「是」）…',
        })
        return runElevated({ launcherPath: launcher.path, logPath: launcher.logPath })
      }
      onPhase?.({
        phase: 'run',
        message: `正在执行 ${source.repo} PowerShell ${action === 'install' ? '汉化脚本' : '还原脚本'}…`,
      })
      const logPath = logPathFor(source, action === 'install' ? 'install' : 'uninstall', stampValue)
      const psRunner = runPowerShell || runNode
      return psRunner({
        entryPath: path.join(dir, ...entryRel.split('/')),
        args: scriptArgs,
        cwd: dir,
        logPath,
      })
    }

    onPhase?.({
      phase: 'run',
      message: `正在执行 ${source.repo} ${action === 'install' ? '汉化注入' : '还原脚本'}…`,
    })
    const { args, entryRel } = buildNodeArgs(source, action, instance, options)
    return runNode({
      entryPath: path.join(dir, ...entryRel.split('/')),
      args,
      cwd: dir,
      logPath: logPathFor(source, action === 'install' ? 'install' : 'uninstall', stampValue),
    })
  }

  function buildPlan({ source, action, instance, currentState, options = {} }) {
    const compatibility = checkCompatibility(source.id, instance, platform, source)
    const sourceDesc = describeSource(source.id, source, options)
    const ours = sameInstance(currentState, instance)
    const hasExistingLocalization =
      ours ||
      Boolean(source.custom) ||
      instance.localization?.state === 'managed' ||
      instance.localization?.state === 'external' ||
      instance.localization?.state === 'stale'

    if (action === 'apply') {
      if (!compatibility.ok) throw new Error(compatibility.reason)
    } else if (!hasExistingLocalization) {
      throw new Error('当前实例尚未安装汉化或未检测到可恢复的备份')
    }

    const changes =
      action === 'apply'
        ? [
            {
              file: `github.com/${source.repo}@${source.branch || shortCommit(source.commit)}`,
              action: 'create',
              summary: '同步 GitHub 汉化仓库到本地缓存',
            },
            {
              file: instance.path,
              action: 'update',
              summary: '按当前可视化配置自动执行仓库安装脚本',
            },
          ]
        : [
            {
              file: instance.path,
              action: 'update',
              summary: '运行仓库还原脚本恢复原始资源',
            },
          ]

    return {
      action: action === 'apply' ? 'apply' : 'uninstall',
      title: action === 'apply' ? `一键汉化 ${source.toolName}` : `恢复 ${source.toolName} 原版`,
      instancePath: instance.path,
      pluginVersion: `${source.repo}@${shortCommit(source.commit || source.branch)}`,
      requirements: [
        `目标版本：${source.toolName} ${sourceDesc.versionText}（当前 v${instance.version ?? '未知'}）`,
        source.elevated ? '管理员权限：执行时会弹出 UAC 窗口' : '自动注入汉化词库与脚本',
      ],
      changes,
      coverage: source.coverage || [],
      warnings: [...(source.warnings || [])],
      source: {
        ...sourceDesc,
        verified: false,
      },
    }
  }

  async function preview(toolId, action, instance, currentState, { override = null, options = {} } = {}) {
    const source = sourceFor(toolId, override)
    if (!source) throw new Error('该工具尚未配置 GitHub 汉化仓库')
    if (!instance?.path) throw new Error('缺少安装实例信息，请重新检测后再试')
    const plan = buildPlan({ source, action, instance, currentState, options })
    const marker = await readMarker(source)
    plan.source.verified = Boolean(marker)
    plan.source.cached = Boolean(marker)
    plan.source.syncedAt = marker?.extractedAt || null
    return plan
  }

  async function apply(toolId, instance, currentState, { override = null, options = null, onPhase } = {}) {
    const source = sourceFor(toolId, override)
    if (!source) throw new Error('该工具尚未配置 GitHub 汉化仓库')
    // 未显式传入 options 时（如单元测试直接调用），默认使用安全不杀进程模式
    const effectiveOptions = options === null ? { ...(source.defaultOptions || {}), autoCloseProcess: false } : options
    buildPlan({ source, action: 'apply', instance, currentState, options: effectiveOptions })
    await assertCanOperate(source, effectiveOptions)

    const { dir, marker } = await ensureSource(source, onPhase)
    const stampValue = stamp(now())
    const outcome = await runInstaller({
      source,
      dir,
      action: 'install',
      instance,
      options: effectiveOptions,
      stampValue,
      onPhase,
    })

    onPhase?.({ phase: 'verify', message: '正在验证汉化结果…' })
    const patched = await hasPatch(toolId, instance.path)
    const tail = await readLogTail(outcome.logPath)

    if (!outcome.ok) {
      const reason = exitReason(outcome)
      const error = new Error(`${source.name}执行失败：${reason}${tail ? `。日志摘要：${tail}` : ''}`)
      error.logPath = outcome.logPath
      if (outcome.code !== 1223) {
        error.attemptedState = {
          status: 'failed',
          toolId,
          instancePath: instance.path,
          instanceVersion: instance.version,
          repo: source.repo,
          branch: source.branch || 'main',
          commit: marker?.commit || source.commit,
          license: source.license?.spdx ?? null,
          at: now().toISOString(),
          message: reason,
          logPath: outcome.logPath,
        }
      }
      throw error
    }
    if (patched === false) {
      const error = new Error(
        `脚本已执行完成，但未在目标目录检测到汉化标记${tail ? `。日志摘要：${tail}` : ''}`,
      )
      error.logPath = outcome.logPath
      error.attemptedState = {
        status: 'failed',
        toolId,
        instancePath: instance.path,
        instanceVersion: instance.version,
        repo: source.repo,
        branch: source.branch || 'main',
        commit: marker?.commit || source.commit,
        license: source.license?.spdx ?? null,
        at: now().toISOString(),
        message: '未检测到汉化标记',
        logPath: outcome.logPath,
      }
      throw error
    }

    const commitUsed = marker?.commit || source.commit || source.branch || 'main'
    return {
      state: {
        status: 'installed',
        toolId,
        instancePath: instance.path,
        instanceVersion: instance.version,
        repo: source.repo,
        branch: source.branch || 'main',
        commit: commitUsed,
        license: source.license?.spdx ?? null,
        options: effectiveOptions,
        installedAt: now().toISOString(),
        logPath: outcome.logPath,
      },
      message: `${source.toolName} 汉化已完成（${source.repo}@${shortCommit(commitUsed)}）。重启目标软件即可生效。`,
      logPath: outcome.logPath,
    }
  }

  async function uninstall(toolId, instance, currentState, { override = null, options = null, onPhase } = {}) {
    const source = sourceFor(toolId, override)
    if (!source) throw new Error('该工具尚未配置 GitHub 汉化仓库')
    const hasExistingLocalization =
      sameInstance(currentState, instance) ||
      Boolean(source.custom) ||
      instance?.localization?.state === 'managed' ||
      instance?.localization?.state === 'external' ||
      instance?.localization?.state === 'stale'
    if (!hasExistingLocalization) {
      throw new Error('未检测到由本软件安装的社区汉化，无法卸载')
    }
    const effectiveOptions = options === null ? { ...(source.defaultOptions || {}), autoCloseProcess: false } : options
    await assertCanOperate(source, effectiveOptions)

    const { dir } = await ensureSource(source, onPhase)
    const stampValue = stamp(now())
    const outcome = await runInstaller({
      source,
      dir,
      action: 'uninstall',
      instance,
      options: effectiveOptions,
      stampValue,
      onPhase,
    })

    onPhase?.({ phase: 'verify', message: '正在验证恢复结果…' })
    const patched = await hasPatch(toolId, instance.path)
    const tail = await readLogTail(outcome.logPath)

    if (!outcome.ok) {
      throw new Error(`${source.name}卸载失败：${exitReason(outcome)}${tail ? `。日志摘要：${tail}` : ''}`)
    }
    if (patched === true) {
      throw new Error(
        `上游卸载器返回成功，但仍检测到汉化标记。请查看日志并手动确认${tail ? `：${tail}` : ''}`,
      )
    }

    return {
      message: `${source.name}已卸载，目标软件资源已从上游备份恢复。请重新启动目标软件确认。`,
      logPath: outcome.logPath,
    }
  }

  /** 执行仓库提供的附加配置动作（如 Claude Desktop 的禁更新、同步技能）。 */
  async function runExtraAction(toolId, actionId, instance, { override = null, options = {}, onPhase } = {}) {
    const source = sourceFor(toolId, override)
    if (!source) throw new Error('该工具尚未配置 GitHub 汉化仓库')
    const extra = (source.extraActions || []).find((item) => item.id === actionId)
    if (!extra) throw new Error(`未找到配置动作：${actionId}`)

    const { dir } = await ensureSource(source, onPhase)
    const stampValue = stamp(now())
    const outcome = await runInstaller({
      source,
      dir,
      action: actionId,
      instance,
      options,
      stampValue,
      onPhase,
    })
    const tail = await readLogTail(outcome.logPath)
    if (!outcome.ok) {
      throw new Error(`执行「${extra.label}」失败：${exitReason(outcome)}${tail ? `。日志摘要：${tail}` : ''}`)
    }
    return {
      ok: true,
      message: `已完成「${extra.label}」（${source.repo}）`,
      logPath: outcome.logPath,
    }
  }

  function describeWithCache(toolId, override = null, options = null) {
    const source = sourceFor(toolId, override)
    if (!source) return null
    const info = describeSource(toolId, override, options)
    const marker = readMarkerSync(source)
    return {
      ...info,
      cached: Boolean(marker),
      syncedAt: marker?.extractedAt || null,
      localCommit: marker?.commit || info.commit || null,
      localDir: sourceDir(source),
    }
  }

  function catalog(config = {}) {
    const repoConfigs = config?.repoConfigs || {}
    const toolOptions = config?.toolOptions || {}
    const builtInIds = ['claude-code', 'claude-desktop', 'antigravity']
    const customIds = (config?.customTools || []).map((t) => t.id)
    const list = []
    for (const id of builtInIds) {
      const desc = describeWithCache(id, repoConfigs[id] || null, toolOptions[id] || null)
      if (desc) list.push(desc)
    }
    for (const custom of config?.customTools || []) {
      const desc = describeWithCache(custom.id, { ...custom, ...(repoConfigs[custom.id] || {}) }, toolOptions[custom.id] || null)
      if (desc) list.push(desc)
    }
    if (!customIds.length && !Object.keys(repoConfigs).length) {
      return list
    }
    return list
  }

  return {
    catalog,
    describeWithCache,
    preview,
    apply,
    uninstall,
    sync,
    runExtraAction,
    ensureSource,
    sourceDir,
  }
}

module.exports = {
  createExternalSources,
  safeExtract,
  verifyLayout,
  isSafeEntry,
}
