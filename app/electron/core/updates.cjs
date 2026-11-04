'use strict'

const DEFAULT_REPO = 'flylink-code/Chinese-localisation-plugin'

function releasesPage(repo = DEFAULT_REPO) {
  return `https://github.com/${repo}/releases`
}

/**
 * 镜像地址是用户输入：只接受 https 基础地址，不允许账号信息、查询参数或锚点，
 * 因为 electron-updater 会直接在其后拼接 latest.yml 与安装包文件名。
 * 返回空字符串表示使用 GitHub 官方源。
 */
function normalizeMirrorUrl(value) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error('镜像地址格式无法识别')
  const trimmed = value.trim()
  if (!trimmed) return ''
  let url
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('镜像地址不是有效的 URL')
  }
  if (url.protocol !== 'https:') throw new Error('镜像地址必须使用 https')
  if (url.username || url.password) throw new Error('镜像地址不能包含账号信息')
  if (url.search || url.hash) throw new Error('镜像地址不能包含查询参数或锚点')
  return url.href.replace(/\/+$/, '')
}

/** 将镜像配置转换为 electron-updater 的 feed 配置。 */
function resolveFeed(mirror, repo = DEFAULT_REPO) {
  const normalized = normalizeMirrorUrl(mirror)
  if (normalized) return { provider: 'generic', url: normalized }
  const [owner, name] = repo.split('/')
  return { provider: 'github', owner, repo: name }
}

/** deb 包与非 AppImage 的 Linux 运行环境不支持自动替换，需要用户手动安装。 */
function isAutoInstallSupported(platform = process.platform, env = process.env) {
  if (platform === 'win32') return true
  if (platform === 'linux') return Boolean(env.APPIMAGE)
  return false
}

function installHint(platform = process.platform, env = process.env, packaged = true) {
  if (!packaged) return '开发模式不执行更新检查与安装，请在已安装的版本中检查更新。'
  if (platform === 'linux' && !env.APPIMAGE) {
    return 'deb 或系统目录安装不支持自动覆盖，请从发布页下载新版本手动安装。'
  }
  return null
}

module.exports = {
  DEFAULT_REPO,
  releasesPage,
  normalizeMirrorUrl,
  resolveFeed,
  isAutoInstallSupported,
  installHint,
}
