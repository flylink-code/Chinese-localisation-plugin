'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs').promises
const os = require('node:os')
const path = require('node:path')
const { detectAntigravity } = require('../core/adapters/antigravity.cjs')

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

async function antigravityFixture(version, marker) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-antigravity-'))
  await fsp.mkdir(path.join(root, 'resources', 'app'), { recursive: true })
  await fsp.writeFile(
    path.join(root, 'resources', 'app', 'package.json'),
    JSON.stringify({ name: 'Antigravity', version }),
  )
  await fsp.writeFile(
    path.join(root, 'resources', 'app.asar'),
    buildAsar({
      'patch.txt': marker ? '__ANTIGRAVITY_CHINESE_LOCALIZATION_START__' : 'original',
    }),
  )
  return root
}

test('Antigravity 社区源安装记录标记为已汉化，并同时开放重新汉化与恢复原版', async (t) => {
  const root = await antigravityFixture('2.28.2', true)
  t.after(() => fsp.rm(root, { recursive: true, force: true }))

  const output = await detectAntigravity({
    manualPath: root,
    external: {
      status: 'installed',
      instancePath: root,
      repo: 'Silas-02/antigravity-desktop-cn',
      commit: 'bd9d60abb4506048b1b75f502c7eda28c4a05879',
    },
  })
  const instance = output.instances[0]
  assert.equal(instance.localization.state, 'managed')
  assert.equal(instance.capabilities.find((item) => item.kind === 'uninstall').enabled, true)
  assert.equal(instance.capabilities.find((item) => item.kind === 'apply').enabled, true)
  assert.equal(instance.capabilities.find((item) => item.kind === 'apply').label, '重新汉化')
})

test('Antigravity v2.27.0 等各版本均直接开放一键汉化入口', async (t) => {
  const root = await antigravityFixture('2.27.0', false)
  t.after(() => fsp.rm(root, { recursive: true, force: true }))

  const output = await detectAntigravity({ manualPath: root, external: null })
  const instance = output.instances[0]
  const apply = instance.capabilities.find((item) => item.kind === 'apply')
  assert.equal(apply.enabled, true)
  assert.equal(apply.label, '下载并安装社区汉化')
})

test('Antigravity 匹配版本且无补丁时开放下载安装入口', async (t) => {
  const root = await antigravityFixture('2.28.2', false)
  t.after(() => fsp.rm(root, { recursive: true, force: true }))

  const output = await detectAntigravity({ manualPath: root, external: null })
  const apply = output.instances[0].capabilities.find((item) => item.kind === 'apply')
  assert.equal(apply.enabled, true)
  assert.equal(apply.label, '下载并安装社区汉化')
})
