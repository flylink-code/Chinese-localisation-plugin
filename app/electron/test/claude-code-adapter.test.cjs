'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { statusForClaudeCode, capabilitiesFor } = require('../core/adapters/claude-code.cjs')

const EXTERNAL = [
  {
    id: 'claude-code-zh-cn@claude-code-zh-cn',
    name: 'claude-code-zh-cn',
    path: 'C:\\Users\\demo\\.claude\\plugins\\cache\\claude-code-zh-cn',
    version: '2.23.0',
    enabled: true,
  },
]

const INSPECT = {
  state: null,
  pluginPresent: false,
  managedMarker: false,
  configured: false,
  allDirs: [],
  settingsExists: true,
  settingsReadable: true,
}

test('已启用的外部中文插件标记为外部汉化并保留接管信息', () => {
  const status = statusForClaudeCode(INSPECT, EXTERNAL, null)
  assert.equal(status.state, 'external')
  assert.match(status.detail, /应用内置汉化时会停用它/)
  assert.deepEqual(status.externalPlugins, EXTERNAL)
})

test('已停用的外部中文插件不再标记为外部汉化', () => {
  const status = statusForClaudeCode(INSPECT, [{ ...EXTERNAL[0], enabled: false }], null)
  assert.equal(status.state, 'none')
  assert.equal(status.externalPlugins, undefined)
})

test('外部汉化在版本满足要求时允许接管', () => {
  const localization = statusForClaudeCode(INSPECT, EXTERNAL, null)
  const capabilities = capabilitiesFor({ form: 'cli', localization, version: '2.1.316' })
  assert.equal(capabilities.find((item) => item.kind === 'apply')?.enabled, true)
  assert.match(capabilities.find((item) => item.kind === 'apply').reason, /停用外部中文插件/)
  assert.equal(capabilities.find((item) => item.kind === 'uninstall')?.enabled, false)
})

test('外部汉化在版本不足时仍禁止接管', () => {
  const localization = statusForClaudeCode(INSPECT, EXTERNAL, null)
  const capabilities = capabilitiesFor({ form: 'cli', localization, version: '2.1.100' })
  assert.equal(capabilities.find((item) => item.kind === 'apply')?.enabled, false)
  assert.match(capabilities.find((item) => item.kind === 'apply').reason, /低于插件要求/)
})
