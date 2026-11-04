'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { checkForUpdates } = require('../core/updates.cjs')

const REPO = 'owner/repo'
const CURRENT = '0.1.0'

function releaseResponse(release, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => release,
  })
}

test('发现更高版本时返回更新信息和发布页', async () => {
  const result = await checkForUpdates(CURRENT, {
    repo: REPO,
    fetchImpl: releaseResponse({
      tag_name: 'v0.2.0',
      html_url: 'https://github.com/owner/repo/releases/tag/v0.2.0',
      published_at: '2026-11-04T08:00:00Z',
    }),
  })
  assert.equal(result.latestVersion, '0.2.0')
  assert.equal(result.hasUpdate, true)
  assert.equal(result.releaseUrl, 'https://github.com/owner/repo/releases/tag/v0.2.0')
  assert.equal(result.publishedAt, '2026-11-04T08:00:00Z')
})

test('版本相同或更低时不提示更新', async () => {
  for (const tag of ['v0.1.0', 'v0.0.9']) {
    const result = await checkForUpdates(CURRENT, { repo: REPO, fetchImpl: releaseResponse({ tag_name: tag }) })
    assert.equal(result.hasUpdate, false, tag)
  }
})

test('仓库没有 Release 时返回不存在的版本而不是已是最新', async () => {
  const result = await checkForUpdates(CURRENT, { repo: REPO, fetchImpl: releaseResponse({}, 404) })
  assert.equal(result.latestVersion, null)
  assert.equal(result.hasUpdate, false)
  assert.equal(result.releaseUrl, 'https://github.com/owner/repo/releases')
})

test('接口错误、标签缺失或响应不可解析时明确报错', async () => {
  await assert.rejects(
    checkForUpdates(CURRENT, { repo: REPO, fetchImpl: releaseResponse({}, 403) }),
    /HTTP 403/,
  )
  await assert.rejects(
    checkForUpdates(CURRENT, { repo: REPO, fetchImpl: releaseResponse({ tag_name: 'nightly' }) }),
    /无法解析最新版本号/,
  )
  await assert.rejects(
    checkForUpdates(CURRENT, {
      repo: REPO,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad json')
        },
      }),
    }),
    /无法解析的响应/,
  )
})

test('网络异常与外部发布链接被正确限制', async () => {
  await assert.rejects(
    checkForUpdates(CURRENT, {
      repo: REPO,
      fetchImpl: async () => {
        throw new Error('getaddrinfo ENOTFOUND')
      },
    }),
    /无法连接 GitHub/,
  )

  const result = await checkForUpdates(CURRENT, {
    repo: REPO,
    fetchImpl: releaseResponse({ tag_name: 'v0.2.0', html_url: 'https://evil.example/download' }),
  })
  assert.equal(result.releaseUrl, 'https://github.com/owner/repo/releases')
})
