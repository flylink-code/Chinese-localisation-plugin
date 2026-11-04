'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs').promises
const os = require('node:os')
const path = require('node:path')
const { findCliExecutables } = require('../core/adapters/claude-code.cjs')
const { detectAntigravity } = require('../core/adapters/antigravity.cjs')
const { detectClaudeDesktop } = require('../core/adapters/claude-desktop.cjs')
const { createClaudeCodeLocalization } = require('../core/localization/claude-code.cjs')
const { createStateStore, createHistoryStore } = require('../core/store.cjs')

const linuxOnly = process.platform === 'linux'

async function writeFakeAsar(file) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  await fsp.writeFile(file, 'fake-asar')
}

test('Linux 检测路径与 Claude Code 汉化闭环', { skip: !linuxOnly }, async (t) => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-linux-'))
  const home = path.join(tmp, 'home')
  const oldHome = process.env.HOME
  process.env.HOME = home
  t.after(async () => {
    process.env.HOME = oldHome
    await fsp.rm(tmp, { recursive: true, force: true })
  })

  const bin = path.join(home, '.local', 'bin')
  await fsp.mkdir(bin, { recursive: true })
  const claude = path.join(bin, 'claude')
  await fsp.writeFile(claude, '#!/bin/sh\necho "2.1.316 (Claude Code)"\n')
  await fsp.chmod(claude, 0o755)

  const executables = await findCliExecutables(null)
  assert.ok(
    executables.some((item) => item.executable === claude),
    '应发现 ~/.local/bin/claude',
  )

  const antigravity = path.join(home, '.local', 'share', 'antigravity')
  await writeFakeAsar(path.join(antigravity, 'resources', 'app.asar'))
  const antigravityResult = await detectAntigravity({ manualPath: null })
  assert.ok(
    antigravityResult.instances.some((item) => item.path === antigravity),
    '应发现 ~/.local/share/antigravity',
  )

  const desktop = path.join(tmp, 'ClaudeDesktop')
  await writeFakeAsar(path.join(desktop, 'resources', 'app.asar'))
  const desktopResult = await detectClaudeDesktop({ manualPath: desktop })
  assert.ok(
    desktopResult.instances.some((item) => item.path === desktop),
    '应发现手动指定的 Claude Desktop 目录',
  )

  const appData = path.join(tmp, 'appdata')
  const settingsPath = path.join(home, '.claude', 'settings.json')
  await fsp.mkdir(path.dirname(settingsPath), { recursive: true })
  await fsp.writeFile(settingsPath, JSON.stringify({ env: { OTHER: 'keep' }, language: 'zh-CN' }, null, 2))
  const service = createClaudeCodeLocalization({
    settingsPath,
    pluginRoot: path.join(appData, 'plugins'),
    backupRoot: path.join(appData, 'backups'),
    sourcePluginDir: path.resolve(__dirname, '..', '..', 'vendor', 'cc-zh'),
    stateStore: createStateStore(path.join(appData, 'state.json')),
    historyStore: createHistoryStore(path.join(appData, 'history.json')),
  })

  const applied = await service.apply({ id: 'fake', path: claude })
  assert.equal(applied.ok, true)
  const settings = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
  assert.equal(settings.env.OTHER, 'keep')
  assert.ok(settings.env.CLAUDE_CODE_PLUGIN_DIRS.includes(path.join(appData, 'plugins', 'cc-zh')))
  const installed = await service.inspect()
  assert.ok(installed.pluginPresent && installed.configured && installed.managedMarker)

  await service.uninstall()
  const restored = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
  assert.equal(restored.env.OTHER, 'keep')
  assert.equal(restored.env.CLAUDE_CODE_PLUGIN_DIRS, undefined)
  assert.equal(restored.language, 'zh-CN')
  await assert.rejects(fsp.access(path.join(appData, 'plugins', 'cc-zh')))
})
