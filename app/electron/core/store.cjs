'use strict'

const { readJsonSafe, writeJsonAtomic } = require('./util.cjs')
const { normalizeMirrorUrl } = require('./updates.cjs')
const { normalizeRepoSlug } = require('./external-catalog.cjs')

function normalizeUpdateConfig(value) {
  const autoCheck = typeof value?.autoCheck === 'boolean' ? value.autoCheck : true
  let mirror = ''
  try {
    mirror = normalizeMirrorUrl(value?.mirror)
  } catch {
    // 磁盘上的非法镜像地址按未配置处理，并在设置页重新填写
    mirror = ''
  }
  return { autoCheck, mirror }
}

function parseArgs(val, fallback = []) {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean)
  if (val === undefined || val === null) return [...fallback]
  return String(val)
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

function createStore(file) {
  async function read(fallback) {
    const result = await readJsonSafe(file)
    if (!result.ok) return fallback
    return result.value ?? fallback
  }
  return {
    read,
    async write(value) {
      await writeJsonAtomic(file, value)
    },
  }
}

function createConfigStore(file) {
  const store = createStore(file)
  return {
    async get() {
      const value = await store.read({ manualPaths: {}, theme: 'system' })
      return {
        manualPaths: value.manualPaths && typeof value.manualPaths === 'object' ? value.manualPaths : {},
        theme: ['system', 'light', 'dark'].includes(value.theme) ? value.theme : 'system',
        update: normalizeUpdateConfig(value.update),
        repoConfigs: value.repoConfigs && typeof value.repoConfigs === 'object' ? value.repoConfigs : {},
        toolOptions: value.toolOptions && typeof value.toolOptions === 'object' ? value.toolOptions : {},
        customTools: Array.isArray(value.customTools) ? value.customTools : [],
      }
    },
    async setManualPath(toolId, target) {
      const current = await this.get()
      if (target) current.manualPaths[toolId] = target
      else delete current.manualPaths[toolId]
      await store.write(current)
      return current
    },
    async setTheme(theme) {
      const current = await this.get()
      current.theme = theme
      await store.write(current)
      return current
    },
    async setUpdate(next) {
      const current = await this.get()
      const autoCheck = next?.autoCheck === undefined ? current.update.autoCheck : next.autoCheck
      if (typeof autoCheck !== 'boolean') throw new Error('自动检查更新选项格式无法识别')
      const mirror = next?.mirror === undefined ? current.update.mirror : normalizeMirrorUrl(next.mirror)
      current.update = { autoCheck, mirror }
      await store.write(current)
      return current
    },
    async setRepoConfig(toolId, repoConfig) {
      const current = await this.get()
      if (!repoConfig) {
        delete current.repoConfigs[toolId]
      } else {
        const repo = normalizeRepoSlug(repoConfig.repo)
        const branch = String(repoConfig.branch || 'main').trim() || 'main'
        current.repoConfigs[toolId] = {
          repo,
          branch,
          ...(repoConfig.entry ? { entry: String(repoConfig.entry).trim() } : {}),
          ...(repoConfig.uninstallEntry !== undefined
            ? { uninstallEntry: String(repoConfig.uninstallEntry || '').trim() }
            : {}),
          ...(repoConfig.subDir !== undefined ? { subDir: String(repoConfig.subDir || '').trim() } : {}),
          ...(repoConfig.runner ? { runner: String(repoConfig.runner).trim() } : {}),
          ...(typeof repoConfig.elevated === 'boolean' ? { elevated: repoConfig.elevated } : {}),
          ...(repoConfig.installArgs !== undefined ? { installArgs: parseArgs(repoConfig.installArgs) } : {}),
          ...(repoConfig.uninstallArgs !== undefined ? { uninstallArgs: parseArgs(repoConfig.uninstallArgs) } : {}),
        }
      }
      await store.write(current)
      return current
    },
    async setToolOptions(toolId, patch) {
      const current = await this.get()
      const prev = current.toolOptions[toolId] && typeof current.toolOptions[toolId] === 'object' ? current.toolOptions[toolId] : {}
      current.toolOptions[toolId] = { ...prev, ...(patch || {}) }
      await store.write(current)
      return current
    },
    async upsertCustomTool(item) {
      const current = await this.get()
      const name = String(item?.name || '').trim()
      if (!name) throw new Error('请填写软件名称')
      const repo = normalizeRepoSlug(item?.repo)
      const branch = String(item?.branch || 'main').trim() || 'main'
      const entry = String(item?.entry || '').trim()
      if (!entry) throw new Error('请填写仓库内的入口脚本路径（例如 localization_engine.js）')
      const uninstallEntry = String(item?.uninstallEntry || '').trim()
      const targetPath = String(item?.path || '').trim()
      if (!targetPath) throw new Error('请选择软件安装目录')
      const id =
        item?.id && String(item.id).startsWith('custom-')
          ? String(item.id)
          : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const defaultUninstallArgs = uninstallEntry ? [] : ['--huifu']
      const record = {
        id,
        name,
        vendor: String(item?.vendor || '自定义软件').trim() || '自定义软件',
        path: targetPath,
        repo,
        branch,
        runner: ['electron-node', 'powershell'].includes(item?.runner) ? item.runner : 'electron-node',
        entry,
        uninstallEntry,
        installArgs: parseArgs(item?.installArgs, []),
        uninstallArgs: parseArgs(item?.uninstallArgs, defaultUninstallArgs),
        elevated: Boolean(item?.elevated),
      }
      const idx = current.customTools.findIndex((t) => t.id === id)
      if (idx >= 0) current.customTools[idx] = record
      else current.customTools.push(record)
      current.manualPaths[id] = targetPath
      await store.write(current)
      return { config: current, tool: record }
    },
    async removeCustomTool(toolId) {
      const current = await this.get()
      current.customTools = current.customTools.filter((t) => t.id !== toolId)
      delete current.manualPaths[toolId]
      delete current.repoConfigs[toolId]
      delete current.toolOptions[toolId]
      await store.write(current)
      return current
    },
  }
}

function createStateStore(file) {
  const store = createStore(file)
  async function read() {
    const value = await store.read({ claudeCode: null })
    return {
      ...value,
      external: value.external && typeof value.external === 'object' ? value.external : {},
    }
  }
  return {
    read,
    async write(value) {
      await store.write(value)
    },
    async setClaudeCode(value) {
      const current = await read()
      current.claudeCode = value
      await store.write(current)
      return current
    },
    /** 写入或清除某个工具的社区源安装记录；value 为 null 时删除。 */
    async setExternal(toolId, value) {
      const current = await read()
      if (value) current.external[toolId] = value
      else delete current.external[toolId]
      await store.write(current)
      return current
    },
  }
}

function createHistoryStore(file, limit = 200) {
  const store = createStore(file)
  return {
    async list() {
      const value = await store.read({ entries: [] })
      return Array.isArray(value.entries) ? value.entries : []
    },
    async append(entry) {
      const entries = await this.list()
      entries.unshift(entry)
      await store.write({ entries: entries.slice(0, limit) })
      return entries.slice(0, limit)
    },
  }
}

module.exports = {
  createConfigStore,
  createStateStore,
  createHistoryStore,
}
