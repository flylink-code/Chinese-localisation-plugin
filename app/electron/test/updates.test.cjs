'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fsp = require('node:fs').promises
const os = require('node:os')
const path = require('node:path')
const { normalizeMirrorUrl, resolveFeed, isAutoInstallSupported, installHint } = require('../core/updates.cjs')
const { createConfigStore } = require('../core/store.cjs')

test('镜像地址只接受 https 基础地址并去掉末尾斜杠', () => {
  assert.equal(normalizeMirrorUrl(''), '')
  assert.equal(normalizeMirrorUrl('   '), '')
  assert.equal(
    normalizeMirrorUrl('https://ghproxy.net/https://github.com/o/r/releases/latest/download/'),
    'https://ghproxy.net/https://github.com/o/r/releases/latest/download',
  )
  assert.throws(() => normalizeMirrorUrl('http://mirror.example/'), /必须使用 https/)
  assert.throws(() => normalizeMirrorUrl('https://user:pass@mirror.example/'), /账号信息/)
  assert.throws(() => normalizeMirrorUrl('https://mirror.example/?token=x'), /查询参数/)
  assert.throws(() => normalizeMirrorUrl('not a url'), /有效的 URL/)
})

test('未配置镜像时使用 GitHub 官方源', () => {
  assert.deepEqual(resolveFeed('', 'owner/repo'), { provider: 'github', owner: 'owner', repo: 'repo' })
  assert.deepEqual(resolveFeed('https://mirror.example/gh', 'owner/repo'), {
    provider: 'generic',
    url: 'https://mirror.example/gh',
  })
})

test('自动安装支持 Windows 与 AppImage，deb 需手动更新', () => {
  assert.equal(isAutoInstallSupported('win32', {}), true)
  assert.equal(isAutoInstallSupported('linux', { APPIMAGE: '/tmp/app.AppImage' }), true)
  assert.equal(isAutoInstallSupported('linux', {}), false)
  assert.equal(isAutoInstallSupported('darwin', {}), false)
  assert.match(installHint('linux', {}, true), /手动安装/)
  assert.match(installHint('win32', {}, false), /开发模式/)
  assert.equal(installHint('win32', {}, true), null)
})

test('更新配置持久化并拒绝非法镜像', async (t) => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'localiser-update-'))
  t.after(() => fsp.rm(tmp, { recursive: true, force: true }))
  const store = createConfigStore(path.join(tmp, 'config.json'))

  assert.deepEqual((await store.get()).update, { autoCheck: true, mirror: '' })

  const saved = await store.setUpdate({ autoCheck: false, mirror: 'https://mirror.example/gh/' })
  assert.deepEqual(saved.update, { autoCheck: false, mirror: 'https://mirror.example/gh' })

  await assert.rejects(store.setUpdate({ mirror: 'http://mirror.example' }), /https/)
  assert.deepEqual((await store.get()).update, { autoCheck: false, mirror: 'https://mirror.example/gh' })
})
