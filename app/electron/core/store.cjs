'use strict'

const { readJsonSafe, writeJsonAtomic } = require('./util.cjs')

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
  }
}

function createStateStore(file) {
  const store = createStore(file)
  return {
    async read() {
      return store.read({ claudeCode: null })
    },
    async write(value) {
      await store.write(value)
    },
    async setClaudeCode(value) {
      const current = await this.read()
      current.claudeCode = value
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
