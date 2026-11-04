'use strict'

const { parseVersion, compareVersions } = require('./util.cjs')

const DEFAULT_REPO = 'flylink-code/Chinese-localisation-plugin'

function releasesPage(repo) {
  return `https://github.com/${repo}/releases`
}

/** GitHub 返回的链接也按不可信输入处理，只接受本仓库的 Release 页面。 */
function releaseUrl(value, repo) {
  const fallback = releasesPage(repo)
  if (typeof value !== 'string') return fallback
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && url.hostname === 'github.com' && url.pathname.startsWith(`/${repo}/releases/`)) {
      return url.href
    }
  } catch {
    // 非法 URL 使用仓库发布页
  }
  return fallback
}

/**
 * 用户主动触发的更新检查：只读取最新 Release 的版本信息，不下载、不安装。
 * 网络失败、限流或响应格式异常都作为明确错误返回，不伪装成“已是最新”。
 */
async function checkForUpdates(
  currentVersion,
  { fetchImpl = globalThis.fetch, repo = DEFAULT_REPO, timeout = 10000 } = {},
) {
  const current = parseVersion(currentVersion)
  if (!current) throw new Error(`无法解析当前版本号：${currentVersion}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let response
  try {
    response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `chinese-localiser/${current.text}`,
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) throw new Error('检查更新超时，请检查网络后重试')
    throw new Error(`无法连接 GitHub：${error.message}`)
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 404) {
    return {
      currentVersion: current.text,
      latestVersion: null,
      hasUpdate: false,
      releaseUrl: releasesPage(repo),
      publishedAt: null,
    }
  }
  if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}`)

  let release
  try {
    release = await response.json()
  } catch {
    throw new Error('GitHub 返回了无法解析的响应')
  }

  const tag = typeof release?.tag_name === 'string' ? release.tag_name.trim() : ''
  const latest = parseVersion(tag)
  if (!latest) throw new Error(`无法解析最新版本号：${tag || '缺失'}`)

  return {
    currentVersion: current.text,
    latestVersion: latest.text,
    hasUpdate: compareVersions(latest.text, current.text) === 1,
    releaseUrl: releaseUrl(release.html_url, repo),
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
  }
}

module.exports = { checkForUpdates, DEFAULT_REPO }
