'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs').promises
const os = require('node:os')
const path = require('node:path')
const {
  SOURCES,
  CUSTOM_TOOL_TEMPLATES,
  checkCompatibility,
  describeSource,
  normalizeRepoSlug,
  sourceFor,
} = require('../core/external-catalog.cjs')
const {
  createExternalSources,
  isSafeEntry,
} = require('../core/external-sources.cjs')
const { createConfigStore } = require('../core/store.cjs')

const DESKTOP_INSTANCE = {
  id: 'desktop-instance',
  path: path.join(os.tmpdir(), 'ClaudeDesktopTest', 'app'),
  version: '4.4212.0',
  localization: { state: 'none' },
}
const ANTIGRAVITY_INSTANCE = {
  id: 'antigravity-instance',
  path: path.join(os.tmpdir(), 'AntigravityTest'),
  version: '2.27.0',
  localization: { state: 'none' },
}

async function seedSource(service, toolId, override = null) {
  const source = sourceFor(toolId, override)
  const dir = service.sourceDir(source)
  await fsp.mkdir(path.dirname(path.join(dir, source.entry)), { recursive: true })
  await fsp.writeFile(path.join(dir, source.entry), '// test entry')
  if (source.uninstallEntry) {
    await fsp.mkdir(path.dirname(path.join(dir, source.uninstallEntry)), { recursive: true })
    await fsp.writeFile(path.join(dir, source.uninstallEntry), '// test uninstall entry')
  }
  await fsp.writeFile(
    path.join(dir, '.source.json'),
    JSON.stringify({
      repo: source.repo,
      branch: source.branch || 'main',
      commit: source.commit || 'abc1234',
      archiveSha256: source.archiveSha256 || '0'.repeat(64),
      extractedAt: '2026-11-04T00:00:00.000Z',
    }),
  )
  return dir
}

async function createHarness(t, overrides = {}) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-source-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const calls = { elevated: [], powershell: [], node: [], download: [] }
  const logPath = path.join(root, 'logs', 'operation.log')
  const service = createExternalSources({
    rootDir: path.join(root, 'sources'),
    logDir: path.join(root, 'logs'),
    download: async (url) => {
      calls.download.push(url)
      return Buffer.from('tampered')
    },
    runElevated: async (options) => {
      calls.elevated.push(options)
      return { ok: true, code: 0, logPath: options.logPath, output: '' }
    },
    runPowerShell: async (options) => {
      calls.powershell.push(options)
      return { ok: true, code: 0, logPath: options.logPath, output: '' }
    },
    runNode: async (options) => {
      calls.node.push(options)
      return { ok: true, code: 0, logPath: options.logPath, output: '' }
    },
    isRunning: async () => false,
    currentUser: async () => ({
      sid: 'S-1-5-21-test',
      userProfile: 'C:\\Users\\tester',
      appData: 'C:\\Users\\tester\\AppData\\Roaming',
      localAppData: 'C:\\Users\\tester\\AppData\\Local',
    }),
    hasPatch: async () => true,
    platform: 'win32',
    now: () => new Date('2026-11-04T00:00:00.000Z'),
    ...overrides,
  })
  return { root, service, calls, logPath, sourceRoot: path.join(root, 'sources') }
}

test('仓库注册表提供预设源、自定义模板、可视化配置定义与仓库规范化', () => {
  for (const source of Object.values(SOURCES)) {
    assert.ok(source.repo.includes('/'))
    assert.ok(source.entry)
    assert.ok(Array.isArray(source.optionSchema))
    assert.ok(Array.isArray(source.presets))
    assert.ok(source.presets.length >= 2)
  }
  assert.ok(Array.isArray(CUSTOM_TOOL_TEMPLATES))
  assert.ok(CUSTOM_TOOL_TEMPLATES.length >= 5)
  assert.equal(normalizeRepoSlug('https://github.com/Silas-02/antigravity-desktop-cn.git'), 'Silas-02/antigravity-desktop-cn')
  const overridden = sourceFor('antigravity', { repo: 'yuexps/Antigravity-Hans', branch: 'dev' })
  assert.equal(overridden.repo, 'yuexps/Antigravity-Hans')
  assert.equal(overridden.branch, 'dev')
  assert.equal(overridden.archiveSha256, null)

  const antigravity = describeSource('antigravity')
  assert.equal(antigravity.license, null)
  assert.match(antigravity.versionText, /全版本通用/)
})

test('兼容性检查開放 Antigravity 全版本并校验平台与最低版本', () => {
  assert.equal(checkCompatibility('claude-desktop', { version: '4.4212.0' }, 'win32').ok, true)
  assert.equal(checkCompatibility('claude-desktop', { version: '4.4212.0' }, 'linux').ok, false)
  assert.equal(checkCompatibility('antigravity', { version: '2.28.2' }, 'win32').ok, true)
  assert.equal(checkCompatibility('antigravity', { version: '2.27.0' }, 'win32').ok, true)
  assert.equal(checkCompatibility('claude-code', { version: '2.1.316' }, 'win32').ok, true)
  assert.equal(checkCompatibility('claude-code', { version: '2.0.0' }, 'win32').ok, false)
})

test('路径安全校验拒绝目录穿越与链接条目', () => {
  assert.equal(isSafeEntry('scripts/install.ps1', { type: 'File' }), true)
  assert.equal(isSafeEntry('root/../evil', { type: 'File' }), false)
  assert.equal(isSafeEntry('../evil', { type: 'File' }), false)
  assert.equal(isSafeEntry('/etc/passwd', { type: 'File' }), false)
  assert.equal(isSafeEntry('C:/Windows/evil', { type: 'File' }), false)
  assert.equal(isSafeEntry('link', { type: 'SymbolicLink' }), false)
  assert.equal(isSafeEntry('hard', { type: 'Link' }), false)
})

test('归档哈希不匹配时停止且不写入源目录', async (t) => {
  const { service, sourceRoot } = await createHarness(t)
  await assert.rejects(
    () => service.ensureSource(SOURCES['claude-desktop']),
    /SHA-256 校验失败/,
  )
  await assert.rejects(() => fsp.access(path.join(sourceRoot, 'claude-desktop', SOURCES['claude-desktop'].commit)))
})

test('预览展示来源、分支与许可证状态', async (t) => {
  const { service } = await createHarness(t)
  const plan = await service.preview('claude-desktop', 'apply', DESKTOP_INSTANCE, null)
  assert.equal(plan.action, 'apply')
  assert.equal(plan.source.repo, 'javaht/claude-desktop-zh-cn')
  assert.equal(plan.source.commit, SOURCES['claude-desktop'].commit)
  assert.equal(plan.source.license, 'MIT')
  assert.equal(plan.source.verified, false)
  assert.ok(plan.warnings.some((item) => item.includes('UAC')))
})

test('平台不匹配时拒绝预览', async (t) => {
  const { service } = await createHarness(t, { platform: 'linux' })
  await assert.rejects(
    () => service.preview('claude-desktop', 'apply', DESKTOP_INSTANCE, null),
    /Windows/,
  )
})

test('Claude Desktop 安装生成提权启动脚本并支持语言选择与附加配置动作', async (t) => {
  const { service, calls } = await createHarness(t)
  await seedSource(service, 'claude-desktop')

  const result = await service.apply('claude-desktop', DESKTOP_INSTANCE, null, {
    options: { language: 'zh-TW' },
  })

  assert.equal(calls.elevated.length, 1)
  assert.equal(calls.download.length, 0)
  const launcher = await fsp.readFile(calls.elevated[0].launcherPath, 'utf8')
  assert.equal(launcher.charCodeAt(0), 0xfeff)
  assert.match(launcher, /-Verb RunAs/)
  assert.match(launcher, /'install' 'zh-TW'/)
  assert.match(launcher, /-AllowTakeOwnership/)
  assert.match(launcher, /-OriginalUserSid 'S-1-5-21-test'/)
  assert.match(launcher, /install_windows\.ps1/)
  assert.match(launcher, /CLAUDE_ZH_SKIP_UPDATE_CHECK/)
  assert.match(launcher, /exit \$installerExit/)
  assert.equal(result.state.status, 'installed')

  // 执行附加动作：禁止自动更新
  const extra = await service.runExtraAction('claude-desktop', 'disable-updates', DESKTOP_INSTANCE)
  assert.equal(extra.ok, true)
  const extraLauncher = await fsp.readFile(calls.elevated[1].launcherPath, 'utf8')
  assert.match(extraLauncher, /'disable-updates'/)
})

test('上游返回成功但没有标记时记录为失败并保留恢复入口', async (t) => {
  const { service } = await createHarness(t, { hasPatch: async () => false })
  await seedSource(service, 'claude-desktop')

  const error = await service
    .apply('claude-desktop', DESKTOP_INSTANCE, null)
    .then(() => null)
    .catch((reason) => reason)
  assert.equal(error.attemptedState.status, 'failed')
  assert.equal(error.attemptedState.instancePath, DESKTOP_INSTANCE.path)
})

test('上游安装器以非零退出码结束时报告失败原因', async (t) => {
  const { service } = await createHarness(t, {
    runElevated: async (options) => ({ ok: false, code: 3, logPath: options.logPath, output: '' }),
  })
  await seedSource(service, 'claude-desktop')

  const error = await service
    .apply('claude-desktop', DESKTOP_INSTANCE, null)
    .then(() => null)
    .catch((reason) => reason)
  assert.match(error.message, /退出码 3/)
  assert.equal(error.attemptedState.status, 'failed')
})

test('Antigravity 支持 --brand-title 参数及进程控制选项', async (t) => {
  const { service, calls } = await createHarness(t)
  await seedSource(service, 'antigravity')

  const result = await service.apply('antigravity', ANTIGRAVITY_INSTANCE, null, {
    options: { brandTitle: 'hidden', autoCloseProcess: false },
  })

  assert.equal(calls.node.length, 1)
  assert.ok(calls.node[0].args.includes('--no-kill'))
  assert.ok(calls.node[0].args.includes('--brand-title'))
  assert.ok(calls.node[0].args.includes('hidden'))
  const installDirIndex = calls.node[0].args.indexOf('--install-dir')
  assert.ok(installDirIndex >= 0)
  assert.equal(calls.node[0].args[installDirIndex + 1], ANTIGRAVITY_INSTANCE.path)
  assert.equal(result.state.status, 'installed')
})

test('自定义软件支持 {path} 占位符、独立恢复脚本与免提权 PowerShell 执行', async (t) => {
  const { service, calls } = await createHarness(t, { hasPatch: async () => null })

  // 1. Cursor Node 脚本：{path} 占位符替换且不强塞 --install-dir
  const cursorOverride = {
    name: 'Cursor',
    repo: 'baishi1114010/cursor-i18n-zh',
    branch: 'main',
    runner: 'electron-node',
    entry: 'index.js',
    installArgs: ['localize', '-p', '{path}'],
    uninstallArgs: ['restore', '-p', '{path}'],
  }
  await seedSource(service, 'custom-cursor', cursorOverride)
  const cursorInstance = {
    id: 'cursor-1',
    path: 'F:\\software\\cursor',
    version: '3.27.22',
    localization: { state: 'none' },
  }
  await service.apply('custom-cursor', cursorInstance, null, { override: cursorOverride })
  assert.equal(calls.node.length, 1)
  assert.deepEqual(calls.node[0].args, ['localize', '-p', 'F:\\software\\cursor'])

  await service.uninstall('custom-cursor', cursorInstance, null, { override: cursorOverride })
  assert.equal(calls.node.length, 2)
  assert.deepEqual(calls.node[1].args, ['restore', '-p', 'F:\\software\\cursor'])

  // 2. Codex Desktop 免提权 PowerShell + 独立恢复入口脚本 Restore-CodexZh.ps1
  const codexOverride = {
    name: 'Codex Desktop',
    repo: 'aimiliya825/codex-desktop-zh-cn',
    branch: 'main',
    runner: 'powershell',
    entry: 'Install-CodexZh.ps1',
    uninstallEntry: 'Restore-CodexZh.ps1',
    installArgs: ['-Yes', '-NoPause', '-LocaleOnly'],
    uninstallArgs: ['-Yes', '-NoPause'],
    elevated: false,
  }
  await seedSource(service, 'custom-codex', codexOverride)
  const codexInstance = {
    id: 'codex-1',
    path: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex',
    version: '26.1027.6604.0',
    localization: { state: 'none' },
  }
  await service.apply('custom-codex', codexInstance, null, { override: codexOverride })
  assert.equal(calls.powershell.length, 1)
  assert.equal(calls.elevated.length, 0)
  assert.match(calls.powershell[0].entryPath, /Install-CodexZh\.ps1$/)
  assert.deepEqual(calls.powershell[0].args, ['-Yes', '-NoPause', '-LocaleOnly'])

  await service.uninstall('custom-codex', codexInstance, null, { override: codexOverride })
  assert.equal(calls.powershell.length, 2)
  assert.match(calls.powershell[1].entryPath, /Restore-CodexZh\.ps1$/)
  assert.deepEqual(calls.powershell[1].args, ['-Yes', '-NoPause'])
})

test('卸载使用已记录实例调用上游卸载器，并在标记消失后返回成功', async (t) => {
  const { service, calls } = await createHarness(t, { hasPatch: async () => false })
  await seedSource(service, 'claude-desktop')
  const current = {
    status: 'installed',
    instancePath: DESKTOP_INSTANCE.path,
    instanceVersion: DESKTOP_INSTANCE.version,
    repo: SOURCES['claude-desktop'].repo,
    commit: SOURCES['claude-desktop'].commit,
  }

  const result = await service.uninstall('claude-desktop', DESKTOP_INSTANCE, current)

  assert.equal(calls.elevated.length, 1)
  const launcher = await fsp.readFile(calls.elevated[0].launcherPath, 'utf8')
  assert.match(launcher, /'uninstall' 'zh-CN'/)
  assert.match(result.message, /已卸载/)
})

test('没有本软件安装记录时拒绝卸载内置软件', async (t) => {
  const { service } = await createHarness(t)
  await assert.rejects(
    () => service.uninstall('claude-desktop', DESKTOP_INSTANCE, null),
    /未检测到由本软件安装/,
  )
})

test('目标软件运行时在关闭自动杀进程模式下拒绝安装', async (t) => {
  const { service } = await createHarness(t, { isRunning: async () => true })
  await assert.rejects(
    () => service.apply('antigravity', ANTIGRAVITY_INSTANCE, null),
    /请先完全退出/,
  )
})

test('配置存储持久化 GitHub 仓库配置、可视化参数与自定义软件', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-store-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const store = createConfigStore(path.join(root, 'config.json'))

  await store.setRepoConfig('antigravity', {
    repo: 'https://github.com/Souma-Sumire/antigravity-zh-cn',
    branch: 'main',
    entry: 'install.js',
    uninstallEntry: 'uninstall.js',
  })
  await store.setToolOptions('claude-desktop', { language: 'zh-HK' })
  const savedCustom = await store.upsertCustomTool({
    name: 'Cursor',
    path: 'F:\\software\\cursor',
    repo: 'baishi1114010/cursor-i18n-zh',
    branch: 'main',
    runner: 'electron-node',
    entry: 'index.js',
    installArgs: 'localize -p {path}',
    uninstallArgs: 'restore -p {path}',
  })

  const loaded = await store.get()
  assert.equal(loaded.repoConfigs.antigravity.repo, 'Souma-Sumire/antigravity-zh-cn')
  assert.equal(loaded.repoConfigs.antigravity.uninstallEntry, 'uninstall.js')
  assert.equal(loaded.toolOptions['claude-desktop'].language, 'zh-HK')
  assert.equal(loaded.customTools.length, 1)
  assert.equal(loaded.customTools[0].name, 'Cursor')
  assert.deepEqual(loaded.customTools[0].installArgs, ['localize', '-p', '{path}'])
  assert.equal(loaded.customTools[0].id, savedCustom.tool.id)

  await store.removeCustomTool(savedCustom.tool.id)
  const afterRemove = await store.get()
  assert.equal(afterRemove.customTools.length, 0)
})
