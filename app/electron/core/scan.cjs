'use strict'

const { errorMessage } = require('./util.cjs')
const { detectClaudeCode } = require('./adapters/claude-code.cjs')
const { detectClaudeDesktop } = require('./adapters/claude-desktop.cjs')
const { detectAntigravity } = require('./adapters/antigravity.cjs')

const ADAPTERS = {
  'claude-code': detectClaudeCode,
  'claude-desktop': detectClaudeDesktop,
  antigravity: detectAntigravity,
}

function withTimeout(promise, ms, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function detectTool(toolId, ctx) {
  const adapter = ADAPTERS[toolId]
  if (!adapter) throw new Error(`没有为 ${toolId} 注册检测适配器`)
  return withTimeout(adapter(ctx), 45000, '检测超时，请检查安装路径或权限后重试')
}

async function detectAll({ tools, config, services, signal, onEvent }) {
  const started = Date.now()
  for (const tool of tools) onEvent?.({ type: 'tool-start', toolId: tool.id })

  const jobs = tools.map(async (tool) => {
    const startedAt = Date.now()
    try {
      const manualPath = config.manualPaths?.[tool.id] || null
      const output = await detectTool(tool.id, {
        manualPath,
        localizationService: services.localizationService,
      })
      const instances = (output.instances || []).sort((a, b) => Number(b.installed) - Number(a.installed))
      if (process.env.LOCALISER_DEBUG) {
        console.log(`[detect] ${tool.id}: ${instances.length} 个实例，${Date.now() - startedAt}ms，manual=${manualPath || '无'}`)
      }
      const result = {
        toolId: tool.id,
        status: instances.length ? 'ok' : 'not-installed',
        instances,
        notes: output.notes || [],
        error: null,
        scannedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }
      if (!signal?.aborted) onEvent?.({ type: 'tool-result', result })
      return result
    } catch (error) {
      const result = {
        toolId: tool.id,
        status: 'error',
        instances: [],
        notes: [],
        error: errorMessage(error),
        scannedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }
      if (!signal?.aborted) onEvent?.({ type: 'tool-error', result })
      return result
    }
  })

  const all = Promise.all(jobs)
  if (!signal) {
    const results = await all
    onEvent?.({ type: 'complete', results })
    return { cancelled: false, results }
  }

  const aborted = new Promise((resolve) => {
    if (signal.aborted) resolve({ cancelled: true, results: [] })
    signal.addEventListener('abort', () => resolve({ cancelled: true, results: [] }), { once: true })
  })
  const completed = all.then((results) => {
    onEvent?.({ type: 'complete', results })
    return { cancelled: false, results }
  })
  const outcome = await Promise.race([completed, aborted])
  if (outcome.cancelled) {
    return { cancelled: true, results: [], durationMs: Date.now() - started }
  }
  return outcome
}

module.exports = { detectAll, detectTool, ADAPTERS }
