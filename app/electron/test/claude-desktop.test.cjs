'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs').promises
const os = require('node:os')
const path = require('node:path')
const { inspectDesktopApp } = require('../core/adapters/claude-desktop.cjs')

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
