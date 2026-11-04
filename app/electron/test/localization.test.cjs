'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = fs.promises
const os = require('node:os')
const path = require('node:path')
const {
  mergePluginDir,
  removePluginDir,
  splitPluginDirs,
  createClaudeCodeLocalization,
} = require('../core/localization/claude-code.cjs')
const { createStateStore, createHistoryStore } = require('../core/store.cjs')

const TARGET = path.join(os.tmpdir(), 'localiser-test-root', 'plugins', 'cc-zh')
const OTHER = path.join(path.parse(os.tmpdir()).root, 'other-plugin')

test('mergePluginDir 创建 env 键并保留其他设置', () => {
  const input = { language: 'zh-CN', env: { OTHER: '1' } }
  const output = mergePluginDir(input, TARGET)
  assert.equal(output.createdEnvKey, true)
  assert.deepEqual(splitPluginDirs(output.settings.env.CLAUDE_CODE_PLUGIN_DIRS), [TARGET])
  assert.equal(output.settings.env.OTHER, '1')
  assert.equal(output.settings.language, 'zh-CN')
  assert.equal(input.env.CLAUDE_CODE_PLUGIN_DIRS, undefined, '不修改传入对象')
})

test('mergePluginDir 追加字符串路径且不重复', () => {
  const first = mergePluginDir({ env: { CLAUDE_CODE_PLUGIN_DIRS: OTHER } }, TARGET)
  assert.equal(first.createdEnvKey, false)
  assert.deepEqual(splitPluginDirs(first.settings.env.CLAUDE_CODE_PLUGIN_DIRS), [OTHER, TARGET])
  const second = mergePluginDir(first.settings, TARGET)
  assert.equal(splitPluginDirs(second.settings.env.CLAUDE_CODE_PLUGIN_DIRS).length, 2)
})

test('mergePluginDir 支持数组形式且拒绝非法 env', () => {
  const merged = mergePluginDir({ env: { CLAUDE_CODE_PLUGIN_DIRS: [OTHER] } }, TARGET)
  assert.deepEqual(merged.settings.env.CLAUDE_CODE_PLUGIN_DIRS, [OTHER, TARGET])
  assert.throws(() => mergePluginDir({ env: 'bad' }, TARGET), /env 不是对象/)
})

test('removePluginDir 只移除本软件路径', () => {
  const settings = { language: 'zh-CN', env: { CLAUDE_CODE_PLUGIN_DIRS: [OTHER, TARGET] } }
  const output = removePluginDir(settings, TARGET, { createdEnvKey: false, settingsExisted: true })
  assert.deepEqual(output.settings.env.CLAUDE_CODE_PLUGIN_DIRS, [OTHER])
  assert.equal(output.settings.language, 'zh-CN')
  assert.equal(output.changed, true)
  assert.equal(output.deleteFile, false)
})

test('removePluginDir 删除由本软件创建的 env 和空配置', () => {
  const merged = mergePluginDir({}, TARGET)
  const output = removePluginDir(merged.settings, TARGET, {
    createdEnvKey: true,
    settingsExisted: false,
  })
  assert.equal(output.settings.env, undefined)
  assert.equal(output.deleteFile, true)
})

test('apply 与 uninstall 完成可恢复闭环并保留用户后续修改', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-cc-'))
  try {
    const sourceDir = path.join(root, 'source', 'cc-zh')
    const sourceFiles = [
      ['.claude-plugin/plugin.json', JSON.stringify({ name: 'cc-zh', version: '0.1.0', license: 'MIT' })],
      ['hooks/hooks.json', JSON.stringify({ modules: ['./register.tsx'] })],
      ['hooks/register.tsx', 'export default {}'],
      ['dict.json', JSON.stringify({ exact: {} })],
      ['LICENSE', 'MIT'],
    ]
    for (const [relative, content] of sourceFiles) {
      const file = path.join(sourceDir, relative)
      await fsp.mkdir(path.dirname(file), { recursive: true })
      await fsp.writeFile(file, content)
    }

    const settingsPath = path.join(root, 'home', '.claude', 'settings.json')
    await fsp.mkdir(path.dirname(settingsPath), { recursive: true })
    await fsp.writeFile(
      settingsPath,
      JSON.stringify({ language: 'zh-CN', env: { CLAUDE_CODE_PLUGIN_DIRS: OTHER } }),
    )

    const pluginRoot = path.join(root, 'userData', 'plugins')
    const backupRoot = path.join(root, 'userData', 'backups')
    const service = createClaudeCodeLocalization({
      settingsPath,
      pluginRoot,
      backupRoot,
      sourcePluginDir: sourceDir,
      stateStore: createStateStore(path.join(root, 'userData', 'state.json')),
      historyStore: createHistoryStore(path.join(root, 'userData', 'history.json')),
    })

    const instance = { id: 'abc', path: path.join(OTHER, 'claude.cmd') }
    const result = await service.apply(instance)
    assert.equal(result.ok, true)

    const settingsAfterApply = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
    assert.ok(fs.existsSync(path.join(pluginRoot, 'cc-zh', 'dict.json')))
    assert.ok(
      splitPluginDirs(settingsAfterApply.env.CLAUDE_CODE_PLUGIN_DIRS).some(
        (item) => path.resolve(item) === path.resolve(path.join(pluginRoot, 'cc-zh')),
      ),
    )
    assert.equal(settingsAfterApply.env.CLAUDE_CODE_PLUGIN_DIRS.includes(OTHER), true)
    const inspect = await service.inspect()
    assert.equal(inspect.state?.pluginVersion, '0.1.0')
    assert.equal(inspect.configured, true)
    assert.equal(inspect.managedMarker, true)

    settingsAfterApply.theme = 'dark'
    await fsp.writeFile(settingsPath, JSON.stringify(settingsAfterApply))

    await service.uninstall()
    const settingsAfterUninstall = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
    assert.equal(settingsAfterUninstall.theme, 'dark', '保留用户在汉化后添加的修改')
    assert.equal(settingsAfterUninstall.language, 'zh-CN')
    assert.deepEqual(splitPluginDirs(settingsAfterUninstall.env.CLAUDE_CODE_PLUGIN_DIRS), [OTHER])
    assert.equal(fs.existsSync(path.join(pluginRoot, 'cc-zh')), false)

    const history = await createHistoryStore(path.join(root, 'userData', 'history.json')).list()
    assert.equal(history.length, 2)
    assert.equal(history[0].action, 'uninstall')
    assert.equal(history[1].action, 'apply')
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})

test('无效 JSON 时拒绝修改并保留原文件', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-invalid-'))
  try {
    const sourceDir = path.join(root, 'source')
    for (const [relative, content] of [
      ['.claude-plugin/plugin.json', JSON.stringify({ name: 'cc-zh', version: '0.1.0' })],
      ['hooks/hooks.json', '{}'],
      ['hooks/register.tsx', ''],
      ['dict.json', '{}'],
    ]) {
      const file = path.join(sourceDir, relative)
      await fsp.mkdir(path.dirname(file), { recursive: true })
      await fsp.writeFile(file, content)
    }
    const settingsPath = path.join(root, 'settings.json')
    await fsp.writeFile(settingsPath, '{\n  // 注释\n}')
    const service = createClaudeCodeLocalization({
      settingsPath,
      pluginRoot: path.join(root, 'plugins'),
      backupRoot: path.join(root, 'backups'),
      sourcePluginDir: sourceDir,
      stateStore: createStateStore(path.join(root, 'state.json')),
      historyStore: createHistoryStore(path.join(root, 'history.json')),
    })
    await assert.rejects(() => service.apply({ id: 'x' }), /不是有效 JSON/)
    assert.equal(await fsp.readFile(settingsPath, 'utf8'), '{\n  // 注释\n}')
    assert.equal(fs.existsSync(path.join(root, 'plugins', 'cc-zh')), false)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }
})
