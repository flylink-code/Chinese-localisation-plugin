'use strict'

const fs = require('node:fs')
const fsp = fs.promises
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')

function normalizePath(value) {
  if (!value) return ''
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase()
}

function samePath(a, b) {
  return normalizePath(a) === normalizePath(b)
}

function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

let noAsarDepth = 0
let noAsarSaved = false

async function withNoAsar(fn) {
  if (noAsarDepth === 0) {
    noAsarSaved = process.noAsar
    process.noAsar = true
  }
  noAsarDepth += 1
  try {
    return await fn()
  } finally {
    noAsarDepth -= 1
    if (noAsarDepth === 0) process.noAsar = noAsarSaved
  }
}

async function exists(target) {
  if (/\.asar$/i.test(target)) {
    return withNoAsar(async () => {
      try {
        await fsp.access(target)
        return true
      } catch {
        return false
      }
    })
  }
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

async function isDirectory(target) {
  try {
    return (await fsp.stat(target)).isDirectory()
  } catch {
    return false
  }
}

async function readJson(file) {
  const text = await fsp.readFile(file, 'utf8')
  return JSON.parse(text)
}

async function readJsonSafe(file) {
  try {
    return { ok: true, value: await readJson(file) }
  } catch (error) {
    return { ok: false, error }
  }
}

async function writeFileAtomic(file, content) {
  const dir = path.dirname(file)
  await fsp.mkdir(dir, { recursive: true })
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`)
  await fsp.writeFile(temp, content, 'utf8')
  await fsp.rename(temp, file)
}

async function writeJsonAtomic(file, value) {
  await writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
}

async function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

async function listDir(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** 分块搜索大文件，避免把整份 app.asar 读入内存。 */
async function fileContainsAny(file, needles, maxBytes = 512 * 1024 * 1024) {
  const found = new Set()
  if (!needles.length) return found
  const maxNeedle = Math.max(...needles.map((item) => Buffer.byteLength(item)))
  const encoded = needles.map((needle) => ({
    original: needle,
    latin1: Buffer.from(needle, 'utf8').toString('latin1'),
  }))
  const chunkSize = 1024 * 1024
  return withNoAsar(
    () =>
      new Promise((resolve, reject) => {
        let read = 0
        let tail = Buffer.alloc(0)
        const stream = fs.createReadStream(file, { highWaterMark: chunkSize })
        stream.on('error', reject)
        stream.on('data', (chunk) => {
          read += chunk.length
          const combined = tail.length ? Buffer.concat([tail, chunk]) : chunk
          const text = combined.toString('latin1')
          for (const needle of encoded) {
            if (text.includes(needle.latin1)) found.add(needle.original)
          }
          tail = combined.subarray(Math.max(0, combined.length - maxNeedle))
          if (found.size === needles.length || read >= maxBytes) stream.destroy()
        })
        stream.on('close', () => resolve(found))
      }),
  )
}

/** 读取 ASAR 归档内单个文件；Electron 的 fs 会把 .asar 当作目录，需临时关闭该行为。 */
async function readAsarEntry(file, entryPath) {
  return withNoAsar(async () => {
    const handle = await fsp.open(file, 'r')
    try {
      const head = Buffer.alloc(16)
      await handle.read(head, 0, 16, 0)
      if (head.readUInt32LE(0) !== 4) throw new Error('不支持的 ASAR 格式')
      const headerSize = head.readUInt32LE(4)
      const jsonSize = head.readUInt32LE(12)
      if (jsonSize <= 0 || jsonSize > 32 * 1024 * 1024) throw new Error('ASAR 头部大小异常')
      const json = Buffer.alloc(jsonSize)
      await handle.read(json, 0, jsonSize, 16)
      const header = JSON.parse(json.toString('utf8'))
      let node = header
      for (const part of entryPath.split('/').filter(Boolean)) {
        node = node?.files?.[part]
      }
      if (!node || node.unpacked || typeof node.size !== 'number') return null
      const base = 8 + headerSize
      const data = Buffer.alloc(node.size)
      await handle.read(data, 0, node.size, base + Number(node.offset))
      return data
    } finally {
      await handle.close()
    }
  })
}

function runCommand(file, args, { timeout = 8000, cwd } = {}) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child
    try {
      child = spawn(file, args, {
        cwd,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ ok: false, stdout: '', stderr: '', error })
      return
    }
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        resolve({ ok: false, stdout, stderr, error: new Error('命令执行超时') })
      }
    }, timeout)
    child.stdout.on('data', (data) => {
      if (stdout.length < 256 * 1024) stdout += data.toString()
    })
    child.stderr.on('data', (data) => {
      if (stderr.length < 64 * 1024) stderr += data.toString()
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr, error })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok: code === 0, code, stdout, stderr })
    })
  })
}

/** Windows 下 .cmd/.bat 需要通过 cmd.exe 调用；参数仅来自本机检测结果。 */
function runCommandLine(commandLine, options = {}) {
  if (process.platform === 'win32') {
    return runCommand('cmd.exe', ['/d', '/s', '/c', commandLine], options)
  }
  return runCommand('/bin/sh', ['-c', commandLine], options)
}

async function runPowerShell(script, { timeout = 10000 } = {}) {
  return runCommand(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout },
  )
}

function parseVersion(text) {
  const match = String(text || '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return { text: `${match[1]}.${match[2]}.${match[3]}`, parts: match.slice(1).map(Number) }
}

function compareVersions(a, b) {
  const left = typeof a === 'string' ? parseVersion(a)?.parts : a
  const right = typeof b === 'string' ? parseVersion(b)?.parts : b
  if (!left || !right) return null
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1
  }
  return 0
}

function makeId(...parts) {
  return sha256(parts.filter(Boolean).join('|')).slice(0, 12)
}

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    '-',
    String(date.getMilliseconds()).padStart(3, '0'),
  ].join('')
}

function errorMessage(error) {
  if (!error) return '未知错误'
  return error.message || String(error)
}

module.exports = {
  normalizePath,
  samePath,
  isInside,
  exists,
  isDirectory,
  withNoAsar,
  readJson,
  readJsonSafe,
  writeFileAtomic,
  writeJsonAtomic,
  sha256File,
  sha256,
  listDir,
  fileContainsAny,
  readAsarEntry,
  runCommand,
  runCommandLine,
  runPowerShell,
  parseVersion,
  compareVersions,
  makeId,
  stamp,
  errorMessage,
}
