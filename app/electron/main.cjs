'use strict'

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = fs.promises
const { TOOLS, getTool } = require('./core/catalog.cjs')
const { createPaths } = require('./core/paths.cjs')
const { createConfigStore, createStateStore, createHistoryStore } = require('./core/store.cjs')
const { createClaudeCodeLocalization } = require('./core/localization/claude-code.cjs')
const { detectAll, detectTool } = require('./core/scan.cjs')
const { checkForUpdates, DEFAULT_REPO } = require('./core/updates.cjs')

let mainWindow = null
let paths = null
let configStore = null
let historyStore = null
let localizationService = null
const runs = new Map()

function sourcePluginDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'plugins', 'cc-zh')
  const bundled = path.join(__dirname, '..', 'resources', 'plugins', 'cc-zh')
  if (fs.existsSync(bundled)) return bundled
  return path.resolve(__dirname, '..', 'vendor', 'cc-zh')
}

function initServices() {
  paths = createPaths(app.getPath('userData'))
  configStore = createConfigStore(paths.configFile)
  const stateStore = createStateStore(paths.stateFile)
  historyStore = createHistoryStore(paths.historyFile)
  localizationService = createClaudeCodeLocalization({
    settingsPath: paths.claudeSettings,
    pluginRoot: paths.pluginRoot,
    backupRoot: paths.backupRoot,
    sourcePluginDir: sourcePluginDir(),
    stateStore,
    historyStore,
  })
}

function applyTheme(theme) {
  if (!mainWindow || process.platform !== 'win32') return
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  try {
    mainWindow.setTitleBarOverlay({
      color: dark ? '#0d0f12' : '#f5f6f8',
      symbolColor: dark ? '#e8ebf0' : '#20232a',
      height: 40,
    })
  } catch {
    // 非 Windows 或无 overlay 支持时忽略
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d0f12',
    title: '汉化管家',
    titleBarStyle: process.platform === 'win32' ? 'hidden' : 'default',
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: nativeTheme.shouldUseDarkColors ? '#0d0f12' : '#f5f6f8',
            symbolColor: nativeTheme.shouldUseDarkColors ? '#e8ebf0' : '#20232a',
            height: 40,
          },
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  if (process.env.LOCALISER_SCREENSHOT) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const deadline = Date.now() + 45000
          while (Date.now() < deadline) {
            const text = await mainWindow.webContents.executeJavaScript(
              "document.querySelector('.detect-meta')?.textContent || ''",
            )
            if (!text.includes('正在检测')) break
            await new Promise((resolve) => setTimeout(resolve, 400))
          }
          const script = process.env.LOCALISER_SCREENSHOT_SCRIPT
          if (script) await mainWindow.webContents.executeJavaScript(script)
          await new Promise((resolve) => setTimeout(resolve, 900))
          const image = await mainWindow.webContents.capturePage()
          await fsp.writeFile(path.resolve(process.env.LOCALISER_SCREENSHOT), image.toPNG())
        } finally {
          app.quit()
        }
      }, Number(process.env.LOCALISER_SCREENSHOT_DELAY || 9000))
    })
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function ensureWindowSender(event) {
  return mainWindow && event.sender === mainWindow.webContents
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', async () => {
    const config = await configStore.get()
    let pluginSource = null
    try {
      pluginSource = await localizationService.sourceInfo()
    } catch (error) {
      pluginSource = { version: null, error: error.message }
    }
    return {
      tools: TOOLS,
      version: app.getVersion(),
      releasesUrl: `https://github.com/${DEFAULT_REPO}/releases`,
      platform: process.platform,
      dataDir: paths.userDataDir,
      settingsPath: paths.claudeSettings,
      backupRoot: paths.backupRoot,
      config,
      pluginSource,
      theme: config.theme,
    }
  })

  ipcMain.handle('detect:run', async (event, runId) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (runs.size > 0) throw new Error('已有检测任务在进行中')
    const controller = new AbortController()
    runs.set(runId, controller)
    const config = await configStore.get()
    try {
      const output = await detectAll({
        tools: TOOLS,
        config,
        services: { localizationService },
        signal: controller.signal,
        onEvent: (payload) => {
          if (!event.sender.isDestroyed()) event.sender.send('detect:event', { runId, ...payload })
        },
      })
      return output
    } finally {
      runs.delete(runId)
    }
  })

  ipcMain.handle('detect:cancel', async (event, runId) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const controller = runs.get(runId)
    if (!controller) return { cancelled: false }
    controller.abort()
    return { cancelled: true }
  })

  ipcMain.handle('path:choose', async (event, toolId) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const tool = getTool(toolId)
    if (!tool) throw new Error('未知的软件')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `选择 ${tool.name} 的安装目录`,
      properties: ['openDirectory'],
      buttonLabel: '使用此目录',
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true }
    const config = await configStore.setManualPath(toolId, result.filePaths[0])
    return { canceled: false, config, path: result.filePaths[0] }
  })

  ipcMain.handle('path:clear', async (event, toolId) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const config = await configStore.setManualPath(toolId, null)
    return { config }
  })

  ipcMain.handle('localization:preview', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (payload?.toolId !== 'claude-code') throw new Error('该工具暂不支持汉化操作')
    const action = payload.action === 'uninstall' ? 'uninstall' : 'apply'
    return localizationService.preview(action, payload.instance || null)
  })

  ipcMain.handle('localization:apply', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (payload?.toolId !== 'claude-code') throw new Error('该工具暂不支持汉化操作')
    const config = await configStore.get()
    const detected = await detectTool('claude-code', {
      manualPath: config.manualPaths['claude-code'] || null,
      localizationService,
    })
    const instance = detected.instances.find((item) => item.id === payload.instanceId)
    if (!instance) throw new Error('安装实例已变化，请重新检测后再试')
    const capability = instance.capabilities.find((item) => item.kind === 'apply')
    if (!capability?.enabled) throw new Error(capability?.reason || '当前实例不允许应用汉化')
    return localizationService.apply(instance)
  })

  ipcMain.handle('localization:uninstall', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (payload?.toolId !== 'claude-code') throw new Error('该工具暂不支持汉化操作')
    return localizationService.uninstall()
  })

  ipcMain.handle('history:list', async (event) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    return historyStore.list()
  })

  ipcMain.handle('app:open-path', async (event, kind) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const targets = {
      data: paths.userDataDir,
      backups: paths.backupRoot,
      plugins: paths.pluginRoot,
      settings: path.dirname(paths.claudeSettings),
    }
    const target = targets[kind]
    if (!target) throw new Error('未知目录')
    await fsp.mkdir(target, { recursive: true })
    const message = await shell.openPath(target)
    if (message) throw new Error(message)
    return { ok: true }
  })

  ipcMain.handle('app:set-theme', async (event, theme) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (!['system', 'light', 'dark'].includes(theme)) throw new Error('未知主题')
    await configStore.setTheme(theme)
    applyTheme(theme)
    return { ok: true }
  })

  ipcMain.handle('app:check-updates', async (event) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    return checkForUpdates(app.getVersion())
  })

  ipcMain.handle('app:open-external', async (event, url) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('仅允许打开 http/https 链接')
    await shell.openExternal(url)
    return { ok: true }
  })
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.localiser.chinese')
  initServices()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
