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
const { findExternalPlugins } = require('./core/adapters/claude-code.cjs')
const { hasClaudeDesktopPatch } = require('./core/adapters/claude-desktop.cjs')
const { hasAntigravityPatch } = require('./core/adapters/antigravity.cjs')
const { createExternalSources } = require('./core/external-sources.cjs')
const { sourceFor } = require('./core/external-catalog.cjs')
const sourceRunner = require('./core/source-runner.cjs')
const { makeId, exists } = require('./core/util.cjs')
const { DEFAULT_REPO, applyMirror } = require('./core/updates.cjs')
const { createUpdateService } = require('./core/update-service.cjs')

let mainWindow = null
let paths = null
let configStore = null
let stateStore = null
let historyStore = null
let localizationService = null
let externalService = null
let updateService = null
let externalRunning = false
const runs = new Map()

function sourcePluginDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'plugins', 'cc-zh')
  const bundled = path.join(__dirname, '..', 'resources', 'plugins', 'cc-zh')
  if (fs.existsSync(bundled)) return bundled
  return path.resolve(__dirname, '..', 'vendor', 'cc-zh')
}

function customToToolMeta(item) {
  return {
    id: item.id,
    name: item.name,
    vendor: item.vendor || '自定义软件',
    category: `GitHub 仓库 (${item.repo})`,
    summary: `通过 ${item.repo}@${item.branch || 'main'} 的 ${item.entry} 执行汉化与还原。`,
    forms: ['自定义目录'],
    supportNote: `关联仓库：${item.repo}`,
    custom: true,
    path: item.path,
  }
}

function getAllTools(config) {
  const customList = Array.isArray(config?.customTools) ? config.customTools.map(customToToolMeta) : []
  return [...TOOLS, ...customList]
}

function findToolMeta(toolId, config) {
  const builtIn = getTool(toolId)
  if (builtIn) return builtIn
  const custom = (config?.customTools || []).find((item) => item.id === toolId)
  return custom ? customToToolMeta(custom) : null
}

function resolveRepoOverride(config, toolId) {
  const custom = (config?.customTools || []).find((item) => item.id === toolId) || null
  const override = config?.repoConfigs?.[toolId] || null
  if (!custom && !override) return null
  return { ...(custom || {}), ...(override || {}) }
}

function resolveToolOptions(config, toolId, runtimePatch = null) {
  const saved = config?.toolOptions?.[toolId] || {}
  return { ...saved, ...(runtimePatch && typeof runtimePatch === 'object' ? runtimePatch : {}) }
}

async function downloadWithMirror(url) {
  const config = await configStore.get().catch(() => null)
  const mirror = config?.update?.mirror || ''
  if (mirror) {
    try {
      const mirroredUrl = applyMirror(url, mirror)
      if (mirroredUrl !== url) {
        return await sourceRunner.downloadArchive(mirroredUrl)
      }
    } catch {
      // 镜像拉取失败时自动回退直连 GitHub
    }
  }
  return sourceRunner.downloadArchive(url)
}

function initServices() {
  paths = createPaths(app.getPath('userData'))
  configStore = createConfigStore(paths.configFile)
  stateStore = createStateStore(paths.stateFile)
  historyStore = createHistoryStore(paths.historyFile)
  localizationService = createClaudeCodeLocalization({
    settingsPath: paths.claudeSettings,
    pluginRoot: paths.pluginRoot,
    backupRoot: paths.backupRoot,
    sourcePluginDir: sourcePluginDir(),
    stateStore,
    historyStore,
  })
  externalService = createExternalSources({
    rootDir: paths.sourceRoot,
    logDir: paths.logRoot,
    preferLatestBranch: true,
    download: (url) => downloadWithMirror(url),
    runElevated: (options) => sourceRunner.runElevatedPowerShell(options),
    runPowerShell: (options) => sourceRunner.runPowerShellScript(options),
    runNode: (options) => sourceRunner.runElectronNode(options),
    isRunning: (names) => sourceRunner.isProcessRunning(names),
    currentUser: () => sourceRunner.getCurrentWindowsUser(),
    hasPatch: async (toolId, instancePath) => {
      if (toolId === 'claude-desktop') return hasClaudeDesktopPatch(instancePath)
      if (toolId === 'antigravity') return hasAntigravityPatch(instancePath)
      return null
    },
  })
  updateService = createUpdateService({
    currentVersion: app.getVersion(),
    getConfig: async () => (await configStore.get()).update,
    saveConfig: async (next) => (await configStore.setUpdate(next)).update,
    onStatus: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:event', status)
    },
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
    height: 860,
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    void updateService.startupCheck()
  })
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

function emitExternal(sender, payload) {
  if (!sender.isDestroyed()) sender.send('external:event', payload)
}

async function findInstance(toolId, instanceId) {
  const config = await configStore.get()
  const state = await stateStore.read()
  const ownState = state.external[toolId] || null
  const customTool = (config.customTools || []).find((item) => item.id === toolId) || null
  const detected = await detectTool(toolId, {
    manualPath: config.manualPaths[toolId] || customTool?.path || null,
    customTool,
    localizationService,
    external: ownState,
  })
  const instance =
    (instanceId && detected.instances.find((item) => item.id === instanceId)) ||
    detected.instances[0]
  if (!instance) throw new Error('未找到可用安装实例，请检查安装路径后重试')
  return { instance, ownState, config }
}

async function appendExternalHistory(payload, entry, config = null) {
  const toolMeta = findToolMeta(payload.toolId, config)
  await historyStore.append({
    id: makeId(payload.toolId, entry.action, new Date().toISOString(), Math.random()),
    at: new Date().toISOString(),
    action: entry.action,
    toolId: payload.toolId,
    toolName: toolMeta?.name || payload.toolId,
    instancePath: entry.instancePath,
    result: entry.result,
    summary: entry.summary,
  })
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
      tools: getAllTools(config),
      version: app.getVersion(),
      releasesUrl: `https://github.com/${DEFAULT_REPO}/releases`,
      platform: process.platform,
      dataDir: paths.userDataDir,
      settingsPath: paths.claudeSettings,
      backupRoot: paths.backupRoot,
      config,
      pluginSource,
      externalSources: externalService.catalog(config),
      theme: config.theme,
      updateStatus: updateService.getStatus(),
    }
  })

  ipcMain.handle('detect:run', async (event, runId) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (runs.size > 0) throw new Error('已有检测任务在进行中')
    const controller = new AbortController()
    runs.set(runId, controller)
    const config = await configStore.get()
    const state = await stateStore.read()
    try {
      const output = await detectAll({
        tools: getAllTools(config),
        config,
        services: { localizationService },
        ownStates: state.external,
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
    const config0 = await configStore.get()
    const tool = findToolMeta(toolId, config0)
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

  ipcMain.handle('path:pick-directory', async (event, title) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || '选择软件安装目录',
      properties: ['openDirectory'],
      buttonLabel: '选择此目录',
    })
    if (result.canceled || !result.filePaths[0]) return { canceled: true, path: null }
    return { canceled: false, path: result.filePaths[0] }
  })

  ipcMain.handle('path:clear', async (event, toolId) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const config = await configStore.setManualPath(toolId, null)
    return { config }
  })

  ipcMain.handle('repo:sync', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const toolId = payload?.toolId
    const config = await configStore.get()
    const tool = findToolMeta(toolId, config)
    if (!tool) throw new Error('未知的软件')
    const override = resolveRepoOverride(config, toolId)
    const synced = await externalService.sync(toolId, {
      override,
      onPhase: (phase) => emitExternal(event.sender, { toolId, ...phase }),
    })
    await appendExternalHistory(
      { toolId },
      {
        action: 'sync',
        instancePath: synced.dir,
        result: 'success',
        summary: synced.message,
      },
      config,
    )
    return {
      ok: true,
      message: synced.message,
      externalSources: externalService.catalog(config),
    }
  })

  ipcMain.handle('repo:set-config', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const { toolId, repoConfig } = payload || {}
    if (!toolId) throw new Error('缺少工具标识')
    const config = await configStore.setRepoConfig(toolId, repoConfig || null)
    return {
      ok: true,
      config,
      externalSources: externalService.catalog(config),
    }
  })

  ipcMain.handle('tool:set-options', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const { toolId, options } = payload || {}
    if (!toolId) throw new Error('缺少工具标识')
    const config = await configStore.setToolOptions(toolId, options || {})
    return {
      ok: true,
      config,
      externalSources: externalService.catalog(config),
    }
  })

  ipcMain.handle('tool:extra-action', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const { toolId, actionId, instanceId } = payload || {}
    if (externalRunning) throw new Error('已有操作正在进行，请等待完成')
    const { instance, config } = await findInstance(toolId, instanceId)
    const override = resolveRepoOverride(config, toolId)
    const options = resolveToolOptions(config, toolId, payload?.options)
    externalRunning = true
    try {
      const result = await externalService.runExtraAction(toolId, actionId, instance, {
        override,
        options,
        onPhase: (phase) => emitExternal(event.sender, { toolId, ...phase }),
      })
      await appendExternalHistory(
        { toolId },
        {
          action: actionId,
          instancePath: instance.path,
          result: 'success',
          summary: result.message,
        },
        config,
      )
      return { ok: true, message: result.message, logPath: result.logPath }
    } catch (error) {
      await appendExternalHistory(
        { toolId },
        {
          action: actionId,
          instancePath: instance.path,
          result: 'failed',
          summary: error.message,
        },
        config,
      )
      throw error
    } finally {
      externalRunning = false
    }
  })

  ipcMain.handle('custom-tool:save', async (event, item) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const { config, tool } = await configStore.upsertCustomTool(item)
    return {
      ok: true,
      config,
      tool,
      tools: getAllTools(config),
      externalSources: externalService.catalog(config),
    }
  })

  ipcMain.handle('custom-tool:remove', async (event, toolId) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const config = await configStore.removeCustomTool(toolId)
    await stateStore.setExternal(toolId, null)
    return {
      ok: true,
      config,
      tools: getAllTools(config),
      externalSources: externalService.catalog(config),
    }
  })

  ipcMain.handle('localization:preview', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const action = payload?.action === 'uninstall' ? 'uninstall' : 'apply'
    const config = await configStore.get()
    if (payload?.toolId === 'claude-code') {
      const external = action === 'apply' ? await findExternalPlugins(paths.claudeSettings) : []
      return localizationService.preview(
        action,
        payload.instance || null,
        external.filter((item) => item.enabled),
      )
    }
    const tool = findToolMeta(payload?.toolId, config)
    if (!tool) throw new Error('未知的软件')
    if (!payload.instance?.id || !payload.instance?.path) {
      throw new Error('缺少安装实例信息，请重新检测后再试')
    }
    const state = await stateStore.read()
    return externalService.preview(
      payload.toolId,
      action,
      payload.instance,
      state.external[payload.toolId] || null,
      {
        override: resolveRepoOverride(config, payload.toolId),
        options: resolveToolOptions(config, payload.toolId, payload.options),
      },
    )
  })

  ipcMain.handle('localization:apply', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const config = await configStore.get()
    const tool = findToolMeta(payload?.toolId, config)
    if (!tool) throw new Error('未知的软件')

    if (payload.toolId === 'claude-code') {
      const detected = await detectTool('claude-code', {
        manualPath: config.manualPaths['claude-code'] || null,
        localizationService,
      })
      const instance =
        (payload.instanceId && detected.instances.find((item) => item.id === payload.instanceId)) ||
        detected.instances.find((item) => item.form === 'cli') ||
        detected.instances[0]
      if (!instance) throw new Error('未找到 Claude Code CLI 实例，请确认已安装后重试')
      const capability = instance.capabilities.find((item) => item.kind === 'apply')
      if (!capability?.enabled) throw new Error(capability?.reason || '当前实例不允许应用汉化')

      const override = resolveRepoOverride(config, 'claude-code')
      const options = resolveToolOptions(config, 'claude-code', payload.options)
      const source = sourceFor('claude-code', override)
      let customPluginDir = null
      const cachedInfo = externalService.describeWithCache('claude-code', override, options)
      if (cachedInfo?.cached && cachedInfo.localDir) {
        const candidateDir = source.subDir
          ? path.join(cachedInfo.localDir, ...source.subDir.split('/'))
          : cachedInfo.localDir
        if (await exists(path.join(candidateDir, '.claude-plugin', 'plugin.json'))) {
          customPluginDir = candidateDir
        }
      } else if (override?.repo && override.repo !== 'jiangnanquan/claude-code-zh') {
        const synced = await externalService.ensureSource(source, (phase) =>
          emitExternal(event.sender, { toolId: 'claude-code', ...phase }),
        )
        customPluginDir = source.subDir
          ? path.join(synced.dir, ...source.subDir.split('/'))
          : synced.dir
      }

      emitExternal(event.sender, {
        toolId: 'claude-code',
        phase: 'run',
        message: '正在写入 Claude Code 中文插件与 settings.json 配置…',
      })
      return localizationService.apply(instance, {
        externalPlugins: instance.localization.externalPlugins || [],
        customPluginDir,
        repo: source?.repo || 'jiangnanquan/claude-code-zh',
        takeoverExternal: options.takeoverExternal !== false,
      })
    }

    if (externalRunning) throw new Error('已有汉化任务正在进行，请等待完成')
    const { instance, ownState } = await findInstance(payload.toolId, payload.instanceId)
    const capability = instance.capabilities.find((item) => item.kind === 'apply')
    if (!capability?.enabled) throw new Error(capability?.reason || '当前实例不允许应用汉化')

    const override = resolveRepoOverride(config, payload.toolId)
    const options = resolveToolOptions(config, payload.toolId, payload.options)
    externalRunning = true
    try {
      const result = await externalService.apply(payload.toolId, instance, ownState, {
        override,
        options,
        onPhase: (phase) => emitExternal(event.sender, { toolId: payload.toolId, ...phase }),
      })
      await stateStore.setExternal(payload.toolId, result.state)
      await appendExternalHistory(
        payload,
        {
          action: 'apply',
          instancePath: instance.path,
          result: 'success',
          summary: result.message,
        },
        config,
      )
      return {
        ok: true,
        message: result.message,
        logPath: result.logPath,
        externalSources: externalService.catalog(config),
      }
    } catch (error) {
      if (error.attemptedState) await stateStore.setExternal(payload.toolId, error.attemptedState)
      await appendExternalHistory(
        payload,
        {
          action: 'apply',
          instancePath: instance.path,
          result: 'failed',
          summary: error.message,
        },
        config,
      )
      throw error
    } finally {
      externalRunning = false
    }
  })

  ipcMain.handle('localization:uninstall', async (event, payload) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    const config = await configStore.get()
    const tool = findToolMeta(payload?.toolId, config)
    if (!tool) throw new Error('未知的软件')
    if (payload.toolId === 'claude-code') return localizationService.uninstall()

    if (externalRunning) throw new Error('已有汉化任务正在进行，请等待完成')
    const { instance, ownState } = await findInstance(payload.toolId, payload.instanceId)
    const capability = instance.capabilities.find((item) => item.kind === 'uninstall')
    if (!capability?.enabled) throw new Error(capability?.reason || '当前实例没有可卸载的汉化补丁')

    const override = resolveRepoOverride(config, payload.toolId)
    const options = resolveToolOptions(config, payload.toolId, payload.options)
    externalRunning = true
    try {
      const result = await externalService.uninstall(payload.toolId, instance, ownState, {
        override,
        options,
        onPhase: (phase) => emitExternal(event.sender, { toolId: payload.toolId, ...phase }),
      })
      await stateStore.setExternal(payload.toolId, null)
      await appendExternalHistory(
        payload,
        {
          action: 'uninstall',
          instancePath: instance.path,
          result: 'success',
          summary: result.message,
        },
        config,
      )
      return { ok: true, message: result.message, logPath: result.logPath }
    } catch (error) {
      await appendExternalHistory(
        payload,
        {
          action: 'uninstall',
          instancePath: instance.path,
          result: 'failed',
          summary: error.message,
        },
        config,
      )
      throw error
    } finally {
      externalRunning = false
    }
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
      sources: paths.sourceRoot,
      logs: paths.logRoot,
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

  ipcMain.handle('update:status', (event) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    return updateService.getStatus()
  })

  ipcMain.handle('update:check', async (event) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    return updateService.check()
  })

  ipcMain.handle('update:download', async (event) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    return updateService.download()
  })

  ipcMain.handle('update:install', (event) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    updateService.install()
    return { ok: true }
  })

  ipcMain.handle('update:set-config', async (event, next) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    return updateService.setConfig(next || {})
  })

  ipcMain.handle('app:open-external', async (event, url) => {
    if (!ensureWindowSender(event)) throw new Error('非法调用来源')
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('仅允许打开 http/https 链接')
    await shell.openExternal(url)
    return { ok: true }
  })
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.localiser.chinese')
  initServices()
  await updateService.init()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
