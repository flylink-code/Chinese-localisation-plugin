'use strict'

const { app } = require('electron')
const { autoUpdater } = require('electron-updater')
const { releasesPage, resolveFeed, isAutoInstallSupported, installHint } = require('./updates.cjs')
const { parseVersion, errorMessage } = require('./util.cjs')

const DEV_HINT = '开发模式不执行更新检查，请在已安装的版本中检查更新。'
const STARTUP_DELAY = 4000

function notesText(info) {
  const notes = info?.releaseNotes
  if (typeof notes === 'string') return notes.trim() || null
  if (Array.isArray(notes)) {
    const text = notes
      .map((item) => `${item?.version ? `v${item.version}` : ''}${item?.note ? `\n${item.note}` : ''}`)
      .join('\n\n')
      .trim()
    return text || null
  }
  return null
}

function infoFields(info) {
  const version = parseVersion(info?.version)?.text || null
  return {
    latestVersion: version,
    releaseDate: typeof info?.releaseDate === 'string' ? info.releaseDate : null,
    releaseNotes: notesText(info),
    releaseUrl: version ? `${releasesPage()}/tag/v${version}` : releasesPage(),
  }
}

/**
 * 基于 electron-updater 的更新服务。
 * 只负责检查与下载；安装必须由用户确认后调用 install()，
 * 不启用退出时自动安装，避免静默改动机器。
 */
function createUpdateService({ currentVersion, getConfig, saveConfig, onStatus }) {
  let config = { autoCheck: true, mirror: '' }
  const status = {
    phase: 'idle',
    currentVersion,
    latestVersion: null,
    releaseDate: null,
    releaseNotes: null,
    releaseUrl: releasesPage(),
    progress: null,
    error: null,
    autoCheck: config.autoCheck,
    mirror: config.mirror,
    canCheck: app.isPackaged,
    canAutoInstall: app.isPackaged && isAutoInstallSupported(),
    installHint: installHint(process.platform, process.env, app.isPackaged),
  }

  function emit() {
    onStatus?.({ ...status })
  }

  function patch(next) {
    Object.assign(status, next)
    emit()
  }

  function supported() {
    return app.isPackaged && isAutoInstallSupported()
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => {
    patch({ phase: 'checking', progress: null, error: null })
  })
  autoUpdater.on('update-available', (info) => {
    patch({ phase: 'available', progress: null, error: null, ...infoFields(info) })
  })
  autoUpdater.on('update-not-available', (info) => {
    patch({ phase: 'up-to-date', progress: null, error: null, ...infoFields(info) })
  })
  autoUpdater.on('download-progress', (progress) => {
    patch({
      phase: 'downloading',
      progress: {
        percent: Math.round(progress.percent * 10) / 10,
        transferred: progress.transferred,
        total: progress.total,
      },
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    patch({ phase: 'downloaded', progress: null, error: null, ...infoFields(info) })
  })
  autoUpdater.on('error', (error) => {
    patch({ phase: 'error', progress: null, error: errorMessage(error) })
  })

  async function init() {
    config = await getConfig()
    patch({ autoCheck: config.autoCheck, mirror: config.mirror })
    autoUpdater.setFeedURL(resolveFeed(config.mirror))
  }

  async function check() {
    if (!app.isPackaged) throw new Error(DEV_HINT)
    patch({ phase: 'checking', progress: null, error: null })
    const result = await autoUpdater.checkForUpdates()
    if (!result) patch({ phase: 'error', error: '更新服务未返回检查结果' })
    return { ...status }
  }

  async function download() {
    if (!supported()) throw new Error(status.installHint || '当前安装形态不支持自动安装更新')
    if (status.phase === 'downloading') return { ...status }
    if (status.phase !== 'available') throw new Error('当前没有可下载的更新，请先检查更新')
    patch({ phase: 'downloading', progress: { percent: 0, transferred: 0, total: 0 }, error: null })
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      patch({ phase: 'error', progress: null, error: errorMessage(error) })
      throw error
    }
    return { ...status }
  }

  function install() {
    if (!supported()) throw new Error(status.installHint || '当前安装形态不支持自动安装更新')
    if (status.phase !== 'downloaded') throw new Error('更新尚未下载完成')
    autoUpdater.quitAndInstall(true, true)
  }

  async function setConfig(next) {
    config = await saveConfig(next)
    autoUpdater.setFeedURL(resolveFeed(config.mirror))
    patch({ autoCheck: config.autoCheck, mirror: config.mirror })
    return { config: { ...config }, status: { ...status } }
  }

  async function startupCheck() {
    if (!config.autoCheck || !app.isPackaged) return
    await new Promise((resolve) => setTimeout(resolve, STARTUP_DELAY))
    try {
      await check()
    } catch (error) {
      // 错误已写入 status，供设置页展示；启动阶段不打断主界面
      console.error(`[update] 启动检查失败：${errorMessage(error)}`)
    }
  }

  return {
    init,
    check,
    download,
    install,
    setConfig,
    startupCheck,
    getStatus: () => ({ ...status }),
  }
}

module.exports = { createUpdateService }
