import type { Register } from 'claude-code'

// ── cc-zh：Claude Code 简体中文 UI mod ─────────────────────────────────────────
// 设计要点（与社区先例 ko-ui 的差异）：
//   1. **以「引擎给的英文原文」为查表键**，而不是按命令名/配置键枚举。
//      `command.describe` 的 `next(e)` 本就返回引擎的英文描述 ⇒ 直接查 exact 表。
//      好处：① 存量扁平表（1894 条 en→zh）可原样复用；② 版本升级后英文一变，
//      只是「命不中、放行原文」，不会译错。
//   2. 全部走 **props 透传改写**（`next({ ...e, props })`），由引擎用自己的组件绘制
//      ⇒ 布局/配色/键位/交互不变；props 不合法时引擎退回原文绘制，不会崩。
//   3. 命不中的字符串写进 `$.store`，由 `/cc-zh-dump` 列出 ⇒ 词典可增量攒。
//   4. 零 token、零网络：只有一次 `$.fs.read` 读静态词典。

type Pattern = { re: string; to: string }

type Dict = {
  exact: Record<string, string>
  spinner: Record<string, string>
  modes: Record<string, string>
  patterns: Pattern[]
}

const EMPTY: Dict = { exact: {}, spinner: {}, modes: {}, patterns: [] }

const MISSING_MAX = 400
const ANSI = new RegExp('\\u001b\\[[0-9;]*m', 'g')
const CJK = /[\u4e00-\u9fff]/
// 键位类词不算「未译完」：ctrl / shift / alt / esc / tab / enter / cmd / opt / fn
const KEYS = /\b(ctrl|shift|alt|esc|tab|enter|cmd|opt|fn)\b[+\w-]*/gi
// ⚠️ 实测坑（2026-10-12，本仓测试发现）：守卫若只放行键位词，会把 CLI / API / MCP
// 这类**全大写缩写**与 Git / GitHub 这类**专有名词**误判为「未译完」，导致含它们
// 的提示行永远不替换。故须一并豁免。
const ACRONYM = /\b[A-Z][A-Z0-9]{1,}\b/g
const PROPER = /\b(Claude|Git|GitHub|Bash|Read|Write|Edit|Grep|Glob|Opus|Sonnet|Haiku|Fable|Mythos|Astra|Vim|Emacs)\b/g

let dict: Promise<Dict> | undefined
let queue: Promise<unknown> = Promise.resolve()
const seen = new Set<string>()

function load($: any): Promise<Dict> {
  dict ??= $.fs
    .read(`${$.plugin.root}/dict.json`)
    .then((t: string) => ({ ...EMPTY, ...JSON.parse(t) }))
    .catch(() => EMPTY)
  return dict
}

/** 记录「仍是英文」的文案，供 /cc-zh-dump 列出。不翻译、不猜测。 */
function record($: any, kind: string, text: string) {
  const t = (text ?? '').replace(ANSI, '').trim()
  if (!t || CJK.test(t) || t.length > 2000) return
  const line = `[${kind}] ${t}`
  if (seen.has(line)) return
  seen.add(line)
  queue = queue.then(async () => {
    const old = ((await $.store.get('missing')) as string[] | undefined) ?? []
    if (old.includes(line) || old.length >= MISSING_MAX) return
    await $.store.set('missing', [...old, line])
  })
}

/** exact 命中 → patterns 兜底；都不中则原样返回。 */
export function tr(d: Dict, text: string): string {
  const bare = text.replace(ANSI, '')
  const hit = d.exact[bare]
  if (hit) return hit
  let out = bare
  for (const p of d.patterns) {
    try {
      out = out.replace(new RegExp(p.re, 'gm'), p.to)
    } catch {
      // 词典里的正则写错，跳过该条
    }
  }
  return out
}

/**
 * 与 `tr` 同源，但**区分「译到了」与「原样放行」**：没译到一律返回 undefined。
 *
 * 为什么需要它：`command.describe` 的 key 是引擎给的整句描述，调用方必须能分辨
 * 「命中」与「未命中」。而该处原先只做裸 exact 查表、不过 patterns ⇒
 * 带**运行时变量**的描述（`/model` 的 `(currently …)`、`/fast` 的 `(Opus)`、
 * `/sandbox` 的状态）结构性无法汉化。此函数让 patterns 在这条路径上生效。
 */
export function trDesc(d: Dict, text: string): string | undefined {
  const bare = text.replace(ANSI, '')
  const out = tr(d, text)
  return out === bare ? undefined : out
}

/**
 * Spinner 用词：**只在当前词仍是英文时**才接替；已含中文一律放行。
 *
 * 为什么必须这样：用户很可能已经用官方 `settings.json` 的 `spinnerVerbs`
 * 配了自定义中文动词（例如「烘焙中」「焯水ing」），此时 `props.word` **本来就是中文**。
 * 若无条件用固定词表覆盖，等于把别人的趣味动词换成「思考中」，是体验退化。
 *
 * @returns `word` 最终采用的词（原样返回时保持 `undefined` 语义）；`missed` 表示
 *          「当前仍是英文，但词典里没有对应词」—— 供 `/cc-zh-dump` 收集。
 */
export function spinnerWord(
  d: Dict,
  mode: string,
  current?: string,
): { word?: string; missed: boolean } {
  if (CJK.test(String(current ?? ''))) return { word: current, missed: false }
  const zh = d.spinner[mode]
  if (!zh) return { word: current, missed: true }
  return { word: zh, missed: false }
}

/**
 * 提示行文案：只有「整句都译到」才接受，否则放行原文。
 * 理由：提示行是短句，半英半中的观感比全英文更差（ko-ui 同判据）。
 */
export function trWhole(d: Dict, text: string): string | undefined {
  const out = tr(d, text)
  if (out === text.replace(ANSI, '')) return undefined
  const rest = out.replace(KEYS, '').replace(ACRONYM, '').replace(PROPER, '')
  return /[A-Za-z]{3,}/.test(rest) ? undefined : out
}

const GROUP_ORDER = ['search', 'read', 'list', 'shell']
const GROUP_OF: Record<string, string> = {
  Grep: 'search', Glob: 'search', Read: 'read', LS: 'list', Bash: 'shell', PowerShell: 'shell',
}
const GROUP_TEXT: Record<string, (n: number, active: boolean) => string> = {
  search: (n, a) => `检索 ${n} 次${a ? '进行中' : '已完成'}`,
  read: (n, a) => `读取 ${n} 个文件${a ? '中' : ''}`,
  list: (n, a) => `列出 ${n} 个目录${a ? '中' : ''}`,
  shell: (n, a) => `执行 ${n} 条命令${a ? '中' : ''}`,
}

export function groupLine(calls: ReadonlyArray<{ tool: string }>, active: boolean): string | undefined {
  const count: Record<string, number> = {}
  for (const c of calls) {
    const g = GROUP_OF[c.tool]
    if (!g) return undefined // 含未知工具 ⇒ 交给引擎原文
    count[g] = (count[g] ?? 0) + 1
  }
  const parts = GROUP_ORDER.filter(g => count[g]).map(g => GROUP_TEXT[g](count[g], active))
  return parts.length > 0 ? parts.join('，') : undefined
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h} 小时 ${m} 分`
  if (m > 0) return `${m} 分 ${r} 秒`
  return `${r} 秒`
}

/** 列出「仍是英文且不在词典里」的命令、配置项与屏幕文案。 */
async function scan($: any) {
  const d = await load($)
  const need = (t?: string) => !!t && t.trim() !== '' && !CJK.test(t) && !d.exact[t.trim()]
  const todo: { commands: Record<string, string>; config: Record<string, string>; texts: string[] } =
    { commands: {}, config: {}, texts: [] }

  const commands: any[] = await $.command.list()
  for (const c of commands) {
    if (c.plugin !== 'cc-zh' && need(c.description)) todo.commands[c.name] = c.description
  }
  const config: any[] = await $.config.list()
  for (const r of config) {
    if (need(r.label)) todo.config[r.key] = r.label
  }
  todo.texts = ((await $.store.get('missing')) as string[] | undefined) ?? []
  return todo
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cc-zh-dump',
      description: '列出词典里还没有中文的命令、配置项与屏幕文案',
    })
    // 词典是异步读的，读完让这两处重算一次
    await $.ui.invalidate('command.describe')
    await $.ui.invalidate('config.describe')
    $.clock.after(8000, async () => {
      const t = await scan($)
      const n = Object.keys(t.commands).length + Object.keys(t.config).length
      if (n > 0) {
        await $.ui.toast(`cc-zh：发现 ${n} 处未译项，输入 /cc-zh-dump 查看`)
      }
    })
    return next(e)
  })

  on('command.run', { command: 'cc-zh-dump' }, async $ => {
    const t = await scan($)
    const cmds = Object.entries(t.commands).map(([k, v]) => `- /${k}: ${v}`)
    const cfgs = Object.entries(t.config).map(([k, v]) => `- ${k}: ${v}`)
    const lines = [
      `未译项：命令 ${cmds.length}，配置 ${cfgs.length}，屏幕文案 ${t.texts.length}`,
      ...(cmds.length ? ['', '[命令说明]', ...cmds] : []),
      ...(cfgs.length ? ['', '[配置项]', ...cfgs] : []),
      ...(t.texts.length ? ['', '[屏幕文案]', ...t.texts.slice(0, 80).map(x => `- ${x}`)] : []),
      '',
      '把上面的英文原样作为 key 加进 dict.json 的 exact 即可（值填中文）。',
    ]
    return { text: lines.join('\n') }
  })

  // ── 斜杠命令说明（`/` 弹出的那一栏）──
  on('command.describe', async ($, e, next) => {
    const d = await load($)
    const r = await next(e)
    const zh = trDesc(d, r.description ?? '')
    if (zh === undefined) {
      record($, `cmd:${e.command}`, r.description ?? '')
      return r
    }
    const hint = r.argumentHint ? trDesc(d, String(r.argumentHint)) : undefined
    return { ...r, description: zh, argumentHint: hint ?? r.argumentHint }
  })

  // ── /config 行 ──
  on('config.describe', async ($, e, next) => {
    const d = await load($)
    const r = await next(e)
    const label = d.exact[(r.label ?? '').trim()]
    const desc = d.exact[(r.description ?? '').trim()]
    if (!label) record($, `config:${e.key}`, r.label ?? '')
    return { ...r, label: label ?? r.label, description: desc ?? r.description }
  })

  // ── 工作态 Spinner ──
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const d = await load($)
    const p = e.props
    let message = p.message
    if (message !== null && message !== undefined) {
      const out = tr(d, message)
      if (out === String(message).replace(ANSI, '')) record($, 'spinner', message)
      else message = out
    }
    const { word, missed } = spinnerWord(d, p.mode, p.word)
    if (missed) record($, `spinner-mode`, p.mode)
    return next({ ...e, props: { ...p, word, message } })
  })

  // ── 提示行（整句译到才替换）──
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const d = await load($)
    const out = trWhole(d, e.props.hint ?? '')
    if (out === undefined) {
      record($, 'hint', e.props.hint ?? '')
      return next(e)
    }
    return next({ ...e, props: { ...e.props, hint: out } })
  })

  // ── 通知条 ──
  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    const d = await load($)
    const text = e.props.text ?? ''
    const out = tr(d, text)
    if (out === text.replace(ANSI, '')) {
      record($, 'notice', text)
      return next(e)
    }
    return next({ ...e, props: { ...e.props, text: out } })
  })

  // ── 页脚模式标签 ──
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const d = await load($)
    const modes = e.props.modes.map((m: string) => {
      const zh = d.modes[m]
      if (!zh) record($, 'mode', m)
      return zh ?? m
    })
    return next({ ...e, props: { ...e.props, modes } })
  })

  // ── `(ctrl+b to run in background)` ──
  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    const hint = e.props.hint ?? ''
    const m = /^\((.+) to run in background\)$/.exec(hint)
    if (!m) {
      record($, 'progress', hint)
      return next(e)
    }
    return next({ ...e, props: { ...e.props, hint: `（${m[1]} 转后台运行）` } })
  })

  // ── 命令输出行 ──
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const d = await load($)
    const text = e.props.text ?? ''
    const out = tr(d, text)
    if (out === text.replace(ANSI, '')) {
      record($, `out:${e.props.command}`, text)
      return next(e)
    }
    return next({ ...e, props: { ...e.props, text: out } })
  })

  // ── 后台任务通知（引擎自绘，透传改写）──
  on(
    'ui.render',
    { component: 'UserMessage', props: { origin: { kind: 'task-notification' } } },
    async ($, e, next) => {
      const d = await load($)
      const text = e.props.text ?? ''
      const out = tr(d, text)
      if (out === text.replace(ANSI, '')) {
        record($, 'task-notification', text)
        return next(e)
      }
      return next({ ...e, props: { ...e.props, text: out } })
    },
  )

  // ── 折叠的工具调用摘要（自绘，因为译文长度与原文不同）──
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const line = groupLine(e.props.calls, e.props.isActive)
    if (line === undefined) {
      record($, 'toolgroup', e.props.calls.map((c: any) => c.tool).join(','))
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text dimColor>
          ● {line}
          {e.props.isActive ? '…' : ''}
        </Text>
        <Text dimColor>（ctrl+o 展开）</Text>
      </Box>
    )
  })

  // ── 轮次结束行（自绘，中文时长）──
  on('ui.render', { component: 'TurnDuration' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>✻ 耗时 {duration(e.props.durationMs)}</Text>
  })
}
