'use strict'

const fsp = require('node:fs').promises
const path = require('node:path')
const { spawn } = require('node:child_process')
const { runCommand, runPowerShell } = require('./util.cjs')

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_CAPTURED_BYTES = 1024 * 1024

function resolveFetch() {
  try {
    const electron = require('electron')
    if (electron && typeof electron === 'object' && typeof electron.net?.fetch === 'function') {
      return electron.net.fetch.bind(electron.net)
    }
  } catch {
    // 非 Electron 进程时回退到 Node 原生 fetch
  }
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis)
  }
  throw new Error('当前运行环境不支持 fetch 网络请求')
}

/** 从 GitHub codeload 下载归档，返回 Buffer。 */
async function downloadArchive(url, { timeout = 180000 } = {}) {
  const fetchFn = resolveFetch()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetchFn(url, { signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
    const length = Number(response.headers.get('content-length') || 0)
    if (length > MAX_ARCHIVE_BYTES) throw new Error('社区源归档体积超出限制，已停止')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('社区源归档体积超出限制，已停止')
    return buffer
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('下载社区源超时，请检查网络后重试')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function spawnWithLog(file, args, { cwd, env, timeout, logPath, writeLog = true }) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(file, args, {
        cwd,
        env,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ ok: false, code: null, error, output: '', logPath })
      return
    }

    const chunks = []
    let captured = 0
    let settled = false
    let timedOut = false

    const collect = (chunk) => {
      if (captured >= MAX_CAPTURED_BYTES) return
      chunks.push(chunk)
      captured += chunk.length
    }

    const finish = async (code, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const output = Buffer.concat(chunks).toString('utf8')
      if (writeLog) {
        try {
          await fsp.mkdir(path.dirname(logPath), { recursive: true })
          await fsp.writeFile(logPath, output, 'utf8')
        } catch {
          // 日志写入失败不改变操作结果，日志路径仍会返回给界面
        }
      }
      resolve({
        ok: !timedOut && !error && code === 0,
        code,
        error: timedOut ? new Error('命令执行超时') : error,
        output,
        logPath,
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeout)

    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => void finish(null, error))
    child.on('close', (code) => void finish(code))
  })
}

/** 以管理员权限运行生成的启动脚本；脚本内部使用 Start-Process -Verb RunAs -Wait。 */
function runElevatedPowerShell({ launcherPath, logPath, timeout = 20 * 60 * 1000 }) {
  return spawnWithLog(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', launcherPath],
    { cwd: path.dirname(launcherPath), logPath, timeout, writeLog: false },
  )
}

/** 以普通权限直接运行 PowerShell 脚本（无需 UAC 弹窗）。 */
function runPowerShellScript({ entryPath, args = [], cwd, logPath, timeout = 10 * 60 * 1000 }) {
  return spawnWithLog(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', entryPath, ...args],
    { cwd: cwd || path.dirname(entryPath), env: { ...process.env }, logPath, timeout, writeLog: true },
  )
}

/** 用打包应用自带的 Electron 以 Node 模式运行上游脚本，不依赖系统 Node.js。 */
function runElectronNode({ entryPath, args, cwd, logPath, timeout = 10 * 60 * 1000 }) {
  return spawnWithLog(process.execPath, [entryPath, ...args], {
    cwd,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    logPath,
    timeout,
    writeLog: true,
  })
}

async function isProcessRunning(names) {
  const list = (names || []).filter(Boolean)
  if (!list.length) return false
  if (process.platform === 'win32') {
    const literal = list.map((name) => `'${name.replace(/'/g, "''")}'`).join(',')
    const script = `@(${literal}) | ForEach-Object { Get-Process -Name $_ -ErrorAction SilentlyContinue } | Select-Object -First 1 -ExpandProperty Id`
    const result = await runPowerShell(script, { timeout: 8000 })
    return result.ok && result.stdout.trim().length > 0
  }
  const result = await runCommand('ps', ['-A', '-o', 'comm='], { timeout: 8000 })
  if (!result.ok) return false
  const wanted = new Set(list.map((name) => name.toLowerCase()))
  return result.stdout
    .split(/\r?\n/)
    .map((line) => path.basename(line.trim()).toLowerCase())
    .some((name) => wanted.has(name))
}

async function getCurrentWindowsUser() {
  if (process.platform !== 'win32') throw new Error('仅 Windows 支持管理员提权安装')
  const script = [
    '$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()',
    '[pscustomobject]@{ sid = $identity.User.Value; userProfile = $env:USERPROFILE; appData = $env:APPDATA; localAppData = $env:LOCALAPPDATA } | ConvertTo-Json -Compress',
  ].join('; ')
  const result = await runPowerShell(script, { timeout: 10000 })
  if (!result.ok || !result.stdout.trim()) {
    throw new Error(`无法读取当前用户信息：${result.stderr || result.error?.message || '未知错误'}`)
  }
  const parsed = JSON.parse(result.stdout.trim())
  if (!parsed.sid || !parsed.userProfile) throw new Error('当前用户信息不完整，无法安全指定安装目标')
  return parsed
}

module.exports = {
  MAX_ARCHIVE_BYTES,
  downloadArchive,
  runElevatedPowerShell,
  runPowerShellScript,
  runElectronNode,
  isProcessRunning,
  getCurrentWindowsUser,
}
