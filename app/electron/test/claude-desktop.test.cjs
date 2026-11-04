'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs').promises
const os = require('node:os')
const path = require('node:path')
const {
  inspectDesktopApp,
  desktopSupport,
  desktopCapabilities,
  detectClaudeDesktop,
} = require('../core/adapters/claude-desktop.cjs')

function buildAsar(entries) {
  const files = {}
  const payloads = []
  let offset = 0
  for (const [name, content] of Object.entries(entries)) {
    const buffer = Buffer.from(content)
    files[name] = { size: buffer.length, offset: String(offset) }
    payloads.push(buffer)
    offset += buffer.length
  }
  const header = Buffer.from(JSON.stringify({ files }))
  const headerSize = 8 + header.length
  const archive = Buffer.alloc(16 + header.length + offset)
  archive.writeUInt32LE(4, 0)
  archive.writeUInt32LE(headerSize, 4)
  archive.writeUInt32LE(header.length + 4, 8)
  archive.writeUInt32LE(header.length, 12)
  header.copy(archive, 16)
  let cursor = 16 + header.length
  for (const payload of payloads) {
    payload.copy(archive, cursor)
    cursor += payload.length
  }
  return archive
}

async function desktopFixture(version, marker) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-desktop-state-'))
  await fsp.mkdir(path.join(root, 'resources', 'app'), { recursive: true })
  await fsp.writeFile(path.join(root, 'Claude.exe'), '')
  await fsp.writeFile(
    path.join(root, 'resources', 'app', 'package.json'),
    JSON.stringify({ version }),
  )
  await fsp.writeFile(
    path.join(root, 'resources', 'app.asar'),
    buildAsar({ 'patch.txt': marker ? '__claudeZhLabelPatch' : 'original' }),
  )
  return root
}

// 回归：调用方读取 inspected.evidence 生成实例字段，
// 该字段缺失会让详情页在渲染「检测依据」时整页崩溃。
test('Claude Desktop 检测结果包含界面所需的 evidence', async (t) => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-desktop-'))
  t.after(() => fsp.rm(tmp, { recursive: true, force: true }))
  await fsp.mkdir(path.join(tmp, 'resources'), { recursive: true })
  await fsp.writeFile(path.join(tmp, 'Claude.exe'), '')

  const inspected = await inspectDesktopApp(tmp, ['安装渠道：测试'])

  assert.equal(inspected.valid, true)
  assert.ok(Array.isArray(inspected.evidence), 'evidence 必须是数组')
  assert.ok(inspected.evidence.includes('安装渠道：测试'))
  assert.ok(Array.isArray(inspected.localization.evidence))
  assert.ok(inspected.localization.evidence.includes('安装渠道：测试'))
})

test('Claude Desktop 识别随包中文词库', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-desktop-zh-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  const withZh = path.join(root, 'with-zh')
  await fsp.mkdir(path.join(withZh, 'resources', 'ion-dist', 'i18n'), { recursive: true })
  await fsp.writeFile(path.join(withZh, 'Claude.exe'), '')
  const missing = await inspectDesktopApp(withZh)
  assert.equal(missing.officialChinese, false)

  await fsp.writeFile(path.join(withZh, 'resources', 'ion-dist', 'i18n', 'zh-CN.json'), '{}')
  const present = await inspectDesktopApp(withZh)
  assert.equal(present.officialChinese, true)
})

test('Claude Desktop 支持说明区分可安装与版本不足', () => {
  const msix = desktopSupport('MSIX / Microsoft Store', false, { ok: true, reason: null })
  assert.match(msix.summary, /社区汉化源/)
  assert.ok(msix.details.some((item) => item.includes('TrustedInstaller')))
  assert.ok(msix.details.some((item) => item.includes('未随包提供简体中文词库')))
  assert.ok(msix.details.some((item) => item.includes('SHA-256')))
  assert.match(msix.link.url, /^https:\/\/github\.com\//)

  const blocked = desktopSupport('MSIX / Microsoft Store', false, {
    ok: false,
    reason: '社区源要求 Claude Desktop v4.29.0 及以上，当前 v4.28.0',
  })
  assert.match(blocked.summary, /暂不支持写入/)
  assert.ok(blocked.details.some((item) => item.includes('v4.28.0')))

  const directory = desktopSupport('默认安装位置', true, { ok: true, reason: null })
  assert.doesNotMatch(directory.summary, /MSIX/)
  assert.ok(directory.details.some((item) => item.includes('设置中切换语言')))
})

test('只有汉化备份、没有注入标记时不再报告为外部汉化', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-desktop-backup-'))
  t.after(() => fsp.rm(root, { recursive: true, force: true }))
  await fsp.mkdir(path.join(root, 'resources', '.zh-cn-backups'), { recursive: true })
  await fsp.writeFile(path.join(root, 'Claude.exe'), '')

  const inspected = await inspectDesktopApp(root)
  assert.equal(inspected.localization.state, 'unknown')
  assert.match(inspected.localization.label, /备份/)
  assert.equal(inspected.hasMarkers, false)
})

test('本软件记录的社区源安装标记为已汉化，并开放重新汉化与恢复原版', async (t) => {
  const root = await desktopFixture('4.4212.0', true)
  t.after(() => fsp.rm(root, { recursive: true, force: true }))

  const output = await detectClaudeDesktop({
    manualPath: root,
    external: {
      status: 'installed',
      instancePath: root,
      repo: 'javaht/claude-desktop-zh-cn',
      commit: '444414d73d6238091f51429c34b9685067f65a2f',
    },
  })
  const instance = output.instances[0]
  assert.equal(instance.localization.state, 'managed')
  assert.match(instance.localization.detail, /可由本软件卸载|可通过本软件卸载/)
  assert.equal(instance.capabilities.find((item) => item.kind === 'uninstall').enabled, true)
  assert.equal(instance.capabilities.find((item) => item.kind === 'apply').enabled, true)
  assert.equal(instance.capabilities.find((item) => item.kind === 'apply').label, '重新汉化')
})

test('已有注入标记时支持直接重新汉化或恢复原版', async (t) => {
  const root = await desktopFixture('4.4212.0', true)
  t.after(() => fsp.rm(root, { recursive: true, force: true }))

  const output = await detectClaudeDesktop({ manualPath: root, external: null })
  const instance = output.instances[0]
  assert.equal(instance.localization.state, 'external')
  assert.equal(instance.capabilities.find((item) => item.kind === 'apply').enabled, true)
  assert.equal(instance.capabilities.find((item) => item.kind === 'uninstall').enabled, true)
})

test('社区源在 Windows 平台开放安装，非支持平台阻止写入', () => {
  const { capabilities } = desktopCapabilities({
    external: null,
    inspected: { localization: { state: 'none' } },
    version: '4.4212.0',
    platform: 'win32',
  })
  const apply = capabilities.find((item) => item.kind === 'apply')
  assert.equal(apply.enabled, true)
  assert.equal(apply.label, '下载并安装社区汉化')
  assert.match(apply.reason, /UAC/)

  const linuxPlatform = desktopCapabilities({
    external: null,
    inspected: { localization: { state: 'none' } },
    version: '4.4212.0',
    platform: 'linux',
  })
  assert.equal(linuxPlatform.capabilities.find((item) => item.kind === 'apply').enabled, false)
})
