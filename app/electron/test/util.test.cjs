'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = fs.promises
const os = require('node:os')
const path = require('node:path')
const { compareVersions, isInside, fileContainsAny, normalizePath, readAsarEntry } = require('../core/util.cjs')

test('compareVersions 能比较三段版本', () => {
  assert.equal(compareVersions('2.1.287', '2.1.287'), 0)
  assert.equal(compareVersions('2.1.296', '2.1.287'), 1)
  assert.equal(compareVersions('2.0.999', '2.1.0'), -1)
  assert.equal(compareVersions('unknown', '2.1.0'), null)
})

test('isInside 阻止目录逃逸', () => {
  const root = path.resolve('C:/data/root')
  assert.equal(isInside(root, path.join(root, 'plugin')), true)
  assert.equal(isInside(root, path.resolve('C:/data/other')), false)
  assert.equal(isInside(root, path.join(root, '..', 'other')), false)
})

test('normalizePath 处理尾部分隔符与平台大小写规则', () => {
  const base = path.resolve('Data', 'Root')
  assert.equal(normalizePath(`${base}${path.sep}`), process.platform === 'linux' ? base : base.toLowerCase())
  if (process.platform === 'linux') {
    assert.notEqual(normalizePath('/Data/root'), normalizePath('/data/root'))
  } else {
    assert.equal(normalizePath('C:/Data/Root/'), normalizePath('c:\\data\\root'))
  }
})

test('fileContainsAny 能跨分块边界找到标记', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-util-'))
  try {
    const file = path.join(dir, 'app.asar')
    const payload = Buffer.concat([
      Buffer.alloc(1024 * 1024 - 5, 0x41),
      Buffer.from('__TEST_MARKER__'),
      Buffer.alloc(64, 0x42),
    ])
    await fsp.writeFile(file, payload)
    const found = await fileContainsAny(file, ['__TEST_MARKER__', 'not-there'])
    assert.deepEqual([...found], ['__TEST_MARKER__'])
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('readAsarEntry 能读取归档内 JSON', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-asar-'))
  try {
    const content = Buffer.from(JSON.stringify({ name: 'demo', version: '1.2.3' }))
    const header = Buffer.from(
      JSON.stringify({ files: { 'package.json': { size: content.length, offset: '0' } } }),
    )
    const headerSize = 8 + header.length
    const archive = Buffer.alloc(16 + header.length + content.length)
    archive.writeUInt32LE(4, 0)
    archive.writeUInt32LE(headerSize, 4)
    archive.writeUInt32LE(header.length + 4, 8)
    archive.writeUInt32LE(header.length, 12)
    header.copy(archive, 16)
    content.copy(archive, 16 + header.length)
    const file = path.join(dir, 'app.asar')
    await fsp.writeFile(file, archive)
    const data = await readAsarEntry(file, 'package.json')
    assert.equal(JSON.parse(data.toString()).version, '1.2.3')
    assert.equal(await readAsarEntry(file, 'missing.json'), null)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})
