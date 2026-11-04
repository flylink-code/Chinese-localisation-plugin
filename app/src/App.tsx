import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DetailsDrawer } from './components/DetailsDrawer'
import { Icon } from './components/Icon'
import { ToolCard } from './components/ToolCard'
import type {
  AppConfig,
  Bootstrap,
  DetectEvent,
  HistoryEntry,
  PreviewPlan,
  ToolDefinition,
  ToolId,
  ToolInstance,
  ToolResult,
  UpdateCheck,
} from './types'

type Page = 'apps' | 'history' | 'settings'
type StatusFilter = 'all' | 'localized' | 'pending' | 'attention'
type DialogState = {
  plan: PreviewPlan
  toolId: ToolId
  instance: ToolInstance | null
  action: 'apply' | 'uninstall'
}

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: '全部状态',
  localized: '已汉化',
  pending: '未汉化',
  attention: '需关注',
}

function idleResult(toolId: ToolId): ToolResult {
  return {
    toolId,
    status: 'idle',
    instances: [],
    notes: [],
    error: null,
    scannedAt: null,
    durationMs: 0,
  }
}

function formatTime(value: string | null) {
  if (!value) return '尚未检测'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatReleaseDate(value: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return null
  return formatDateTime(value)
}

function isLocalized(state: ToolInstance['localization']['state']) {
  return state === 'managed' || state === 'native' || state === 'external'
}

function isAttention(state: ToolInstance['localization']['state']) {
  return state === 'stale' || state === 'unknown' || state === 'partial'
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ToolResult>>({})
  const [detecting, setDetecting] = useState(false)
  const [lastDetected, setLastDetected] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('apps')
  const [query, setQuery] = useState('')
  const [installedOnly, setInstalledOnly] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [drawerToolId, setDrawerToolId] = useState<ToolId | null>(null)
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Record<string, string>>({})
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [updateState, setUpdateState] = useState<
    { phase: 'idle' | 'checking' } | { phase: 'done'; data: UpdateCheck } | { phase: 'error'; error: string }
  >({ phase: 'idle' })
  const [busy, setBusy] = useState(false)
  const runIdRef = useRef<string | null>(null)
  const resultsRef = useRef<Record<string, ToolResult>>({})
  const toastTimer = useRef<number | null>(null)

  resultsRef.current = results

  const showToast = useCallback((message: string, tone: 'success' | 'danger' | 'info' = 'info') => {
    setToast({ message, tone })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4200)
  }, [])

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await api.listHistory())
    } catch (error) {
      showToast(`读取操作记录失败：${(error as Error).message}`, 'danger')
    }
  }, [showToast])

  const runDetection = useCallback(async () => {
    if (!bootstrap || detecting) return
    const runId = crypto.randomUUID()
    runIdRef.current = runId
    const previous = resultsRef.current
    setDetecting(true)
    setResults((current) => {
      const next = { ...current }
      for (const tool of bootstrap.tools) next[tool.id] = { ...idleResult(tool.id), status: 'scanning' }
      return next
    })
    try {
      const output = await api.detect(runId)
      if (output.cancelled) {
        setResults(previous)
        showToast('已取消检测', 'info')
      } else {
        const merged: Record<string, ToolResult> = {}
        for (const tool of bootstrap.tools) {
          merged[tool.id] =
            output.results.find((item) => item.toolId === tool.id) ?? {
              ...idleResult(tool.id),
              status: 'error',
              error: '未返回检测结果',
            }
        }
        setResults(merged)
        setLastDetected(new Date().toISOString())
        const installed = output.results.filter((item) => item.status === 'ok').length
        const failed = output.results.filter((item) => item.status === 'error').length
        showToast(
          failed > 0
            ? `检测完成：${installed} 个软件已安装，${failed} 个检测失败`
            : `检测完成：发现 ${installed} 个已安装软件`,
          failed > 0 ? 'danger' : 'success',
        )
      }
    } catch (error) {
      setResults(previous)
      showToast(`检测失败：${(error as Error).message}`, 'danger')
    } finally {
      runIdRef.current = null
      setDetecting(false)
    }
  }, [bootstrap, detecting, showToast])

  useEffect(() => {
    let cancelled = false
    api
      .bootstrap()
      .then((info) => {
        if (cancelled) return
        setBootstrap(info)
        setTheme(info.theme)
        const initial: Record<string, ToolResult> = {}
        for (const tool of info.tools) initial[tool.id] = idleResult(tool.id)
        setResults(initial)
      })
      .catch((error) => setBootError((error as Error).message))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!bootstrap) return
    void runDetection()
    // 首次加载后执行一次自动检测
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap])

  useEffect(() => {
    const unsubscribe = api.onDetectEvent((event: DetectEvent) => {
      if (!runIdRef.current || event.runId !== runIdRef.current) return
      if (event.type === 'tool-start' && event.toolId) {
        setResults((current) => ({
          ...current,
          [event.toolId!]: { ...idleResult(event.toolId!), status: 'scanning' },
        }))
      }
      if ((event.type === 'tool-result' || event.type === 'tool-error') && event.result) {
        setResults((current) => ({ ...current, [event.result!.toolId]: event.result! }))
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (page === 'history') void refreshHistory()
  }, [page, refreshHistory])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (dialog && !dialogBusy) setDialog(null)
      else if (drawerToolId && !dialog) setDrawerToolId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialog, dialogBusy, drawerToolId])

  const tools = bootstrap?.tools ?? []
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools])

  const stats = useMemo(() => {
    let installed = 0
    let localized = 0
    let attention = 0
    for (const tool of tools) {
      const result = results[tool.id]
      if (!result) continue
      if (result.status === 'ok') installed += 1
      const primary = result.instances[0]
      if (primary && isLocalized(primary.localization.state)) localized += 1
      if (primary && isAttention(primary.localization.state)) attention += 1
      if (result.status === 'error') attention += 1
    }
    return { installed, localized, attention }
  }, [tools, results])

  const visibleTools = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return tools.filter((tool) => {
      const result = results[tool.id] ?? idleResult(tool.id)
      if (result.status === 'scanning' || result.status === 'idle') {
        return !keyword || tool.name.toLowerCase().includes(keyword)
      }
      if (installedOnly && result.status !== 'ok' && result.status !== 'error') return false
      const primary = result.instances[0]
      if (statusFilter === 'localized' && !(primary && isLocalized(primary.localization.state))) return false
      if (statusFilter === 'pending' && !(result.status === 'ok' && primary?.localization.state === 'none')) return false
      if (statusFilter === 'attention') {
        const badState = primary && isAttention(primary.localization.state)
        if (!badState && result.status !== 'error') return false
      }
      if (keyword) {
        const haystack = [
          tool.name,
          tool.vendor,
          tool.summary,
          primary?.path ?? '',
          primary?.version ?? '',
          result.error ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(keyword)) return false
      }
      return true
    })
  }, [tools, results, installedOnly, statusFilter, query])

  const drawerTool = drawerToolId ? toolMap.get(drawerToolId) ?? null : null
  const drawerResult = drawerTool ? results[drawerTool.id] : null
  const manualPath = (toolId: ToolId) => bootstrap?.config.manualPaths?.[toolId] ?? null

  const updateConfig = (config: AppConfig) => {
    setBootstrap((current) => (current ? { ...current, config } : current))
  }

  const choosePath = async (toolId: ToolId) => {
    setBusy(true)
    try {
      const output = await api.choosePath(toolId)
      if (output.canceled || !output.config) {
        showToast('已取消选择', 'info')
        return
      }
      updateConfig(output.config)
      showToast('安装路径已更新，正在重新检测', 'success')
      await runDetection()
    } catch (error) {
      showToast(`选择路径失败：${(error as Error).message}`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const clearPath = async (toolId: ToolId) => {
    setBusy(true)
    try {
      const output = await api.clearPath(toolId)
      updateConfig(output.config)
      showToast('已清除手动路径', 'success')
      await runDetection()
    } catch (error) {
      showToast(`清除路径失败：${(error as Error).message}`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const openPreview = async (toolId: ToolId, action: 'apply' | 'uninstall', instance: ToolInstance | null) => {
    setBusy(true)
    try {
      const plan = await api.previewLocalization({
        toolId,
        action,
        instance,
        instanceId: instance?.id,
      })
      setDialogError(null)
      setDialog({ plan, toolId, instance, action })
    } catch (error) {
      showToast(`无法生成变更预览：${(error as Error).message}`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const handleCardAction = (tool: ToolDefinition, action: 'apply' | 'uninstall' | 'details' | 'choose-path') => {
    const result = results[tool.id]
    if (action === 'choose-path') {
      void choosePath(tool.id)
      return
    }
    if (action === 'details' || !result) {
      setDrawerToolId(tool.id)
      return
    }
    const instance = result.instances[0] ?? null
    if (action === 'apply') void openPreview(tool.id, 'apply', instance)
    if (action === 'uninstall') void openPreview(tool.id, 'uninstall', instance)
  }

  const confirmDialog = async () => {
    if (!dialog) return
    setDialogBusy(true)
    setDialogError(null)
    try {
      const output =
        dialog.action === 'apply'
          ? await api.applyLocalization({
              toolId: dialog.toolId,
              instanceId: dialog.instance?.id ?? '',
            })
          : await api.uninstallLocalization({ toolId: dialog.toolId })
      setDialog(null)
      showToast(output.message, 'success')
      await runDetection()
      await refreshHistory()
    } catch (error) {
      setDialogError((error as Error).message)
    } finally {
      setDialogBusy(false)
    }
  }

  const changeTheme = async (next: 'system' | 'light' | 'dark') => {
    setTheme(next)
    try {
      await api.setTheme(next)
    } catch (error) {
      showToast(`保存主题失败：${(error as Error).message}`, 'danger')
    }
  }

  const openPath = async (kind: 'data' | 'backups' | 'plugins' | 'settings') => {
    try {
      await api.openPath(kind)
    } catch (error) {
      showToast(`打开目录失败：${(error as Error).message}`, 'danger')
    }
  }

  const cancelDetection = async () => {
    if (!runIdRef.current) return
    await api.cancelDetect(runIdRef.current)
  }

  const checkUpdates = async () => {
    setUpdateState({ phase: 'checking' })
    try {
      setUpdateState({ phase: 'done', data: await api.checkUpdates() })
    } catch (error) {
      setUpdateState({ phase: 'error', error: (error as Error).message })
    }
  }

  const openExternal = async (url: string) => {
    try {
      await api.openExternal(url)
    } catch (error) {
      showToast(`打开链接失败：${(error as Error).message}`, 'danger')
    }
  }

  const resetFilters = () => {
    setQuery('')
    setStatusFilter('all')
    setInstalledOnly(true)
  }

  if (!bootstrap) {
    return (
      <div className="app-loading">
        <div className="brand-mark large">汉</div>
        <p>{bootError ? `启动失败：${bootError}` : '正在加载…'}</p>
      </div>
    )
  }

  const pageTitle = page === 'apps' ? '软件管理' : page === 'history' ? '操作记录' : '设置'
  const releaseDate = updateState.phase === 'done' ? formatReleaseDate(updateState.data.publishedAt) : null
  const pageSubtitle =
    page === 'apps'
      ? '检测本机已安装的 AI 工具，查看汉化状态并管理汉化。'
      : page === 'history'
        ? '查看本软件执行过的汉化与卸载操作。'
        : '主题、数据目录与版本信息。'

  return (
    <div className="app-shell">
      <div className="titlebar-drag" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">汉</div>
          <div className="brand-text">
            <strong>汉化管家</strong>
            <span>中文本地化管理</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          <button className={page === 'apps' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('apps')}>
            <Icon name="apps" size={18} />
            软件管理
            <span className="nav-count">{stats.installed}</span>
          </button>
          <button className={page === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('history')}>
            <Icon name="history" size={18} />
            操作记录
          </button>
          <button className={page === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('settings')}>
            <Icon name="settings" size={18} />
            设置
          </button>
        </nav>

        <div className="sidebar-note">
          <Icon name="shield" size={16} />
          <p>检测只读，不上传安装信息。写入前自动备份。</p>
        </div>

        <div className="sidebar-footer">
          <div className="theme-switch" role="group" aria-label="主题">
            {(
              [
                ['light', 'sun', '浅色'],
                ['system', 'monitor', '跟随系统'],
                ['dark', 'moon', '深色'],
              ] as const
            ).map(([value, icon, label]) => (
              <button
                key={value}
                className={theme === value ? 'theme-btn active' : 'theme-btn'}
                onClick={() => void changeTheme(value)}
                title={label}
                aria-label={label}
                aria-pressed={theme === value}
              >
                <Icon name={icon} size={16} />
              </button>
            ))}
          </div>
          <span className="version">v{bootstrap.version}</span>
        </div>
      </aside>

      <main className="main">
        <header className="page-head">
          <div>
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          <div className="head-actions">
            {page === 'apps' && (
              <>
                <label className="search-box">
                  <Icon name="search" size={17} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索软件、路径或版本"
                    aria-label="搜索软件"
                  />
                  {query && (
                    <button className="search-clear" onClick={() => setQuery('')} aria-label="清除搜索">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </label>
                {detecting ? (
                  <button className="btn btn-ghost" onClick={() => void cancelDetection()}>
                    <span className="spinner" aria-hidden="true" />
                    取消检测
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => void runDetection()}>
                    <Icon name="refresh" size={16} />
                    重新检测
                  </button>
                )}
              </>
            )}
            {page === 'history' && (
              <>
                <button className="btn btn-ghost" onClick={() => void openPath('backups')}>
                  <Icon name="folder" size={16} />
                  打开备份目录
                </button>
                <button className="btn btn-ghost" onClick={() => void refreshHistory()}>
                  <Icon name="refresh" size={16} />
                  刷新
                </button>
              </>
            )}
            {page === 'settings' && (
              <button className="btn btn-primary" onClick={() => void runDetection()} disabled={detecting}>
                <Icon name="refresh" size={16} />
                重新检测
              </button>
            )}
          </div>
        </header>

        {page === 'apps' && (
          <section className="content">
            <div className="toolbar">
              <div className="segmented" role="group" aria-label="安装筛选">
                <button
                  className={installedOnly ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => setInstalledOnly(true)}
                >
                  已安装
                  <span>{stats.installed}</span>
                </button>
                <button
                  className={!installedOnly ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => setInstalledOnly(false)}
                >
                  全部目录
                  <span>{tools.length}</span>
                </button>
              </div>
              <div className="chip-row" role="group" aria-label="汉化状态筛选">
                {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((value) => (
                  <button
                    key={value}
                    className={statusFilter === value ? 'chip active' : 'chip'}
                    onClick={() => setStatusFilter(value)}
                  >
                    {STATUS_LABELS[value]}
                    {value === 'attention' && stats.attention > 0 && (
                      <span className="chip-count">{stats.attention}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="detect-meta">
                <span>{detecting ? '正在检测…' : `最近检测：${formatTime(lastDetected)}`}</span>
              </div>
            </div>

            {stats.attention > 0 && !detecting && (
              <div className="notice notice-warning summary-notice">
                <Icon name="alert" size={17} />
                <p>{stats.attention} 个软件需要关注：版本不适配、外部汉化或状态待确认。详情中不会提供不安全的写入入口。</p>
              </div>
            )}

            <div className="tool-grid">
              {visibleTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  result={results[tool.id] ?? idleResult(tool.id)}
                  onOpen={() => setDrawerToolId(tool.id)}
                  onAction={(action) => handleCardAction(tool, action)}
                />
              ))}
            </div>

            {visibleTools.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="search" size={26} />
                </div>
                <h3>{installedOnly ? '没有发现已安装的软件' : '没有符合条件的软件'}</h3>
                <p>
                  {installedOnly
                    ? '切换到「全部目录」可以查看支持列表，或手动指定未识别工具的安装路径。'
                    : '尝试调整搜索关键词或状态筛选。'}
                </p>
                <button className="btn btn-ghost" onClick={resetFilters}>
                  重置筛选
                </button>
              </div>
            )}

            <p className="disclaimer">
              检测仅读取本机已知安装位置和配置，不执行参考项目脚本，也不自动安装或卸载目标软件。
            </p>
          </section>
        )}

        {page === 'history' && (
          <section className="content">
            {history.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="history" size={26} />
                </div>
                <h3>还没有操作记录</h3>
                <p>应用或卸载汉化后，结果会记录在这里；记录不包含配置内容和敏感信息。</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((entry) => (
                  <article className="history-item" key={entry.id}>
                    <span className={`history-icon ${entry.result === 'success' ? 'success' : 'danger'}`}>
                      <Icon name={entry.action === 'apply' ? 'download' : 'trash'} size={17} />
                    </span>
                    <div className="history-body">
                      <div className="history-title">
                        <strong>{entry.toolName}</strong>
                        <span className="history-action">
                          {entry.action === 'apply' ? '应用汉化' : '卸载汉化'}
                        </span>
                        <span className={`result-tag ${entry.result}`}>
                          {entry.result === 'success' ? '成功' : '失败'}
                        </span>
                      </div>
                      <p>{entry.summary}</p>
                      {entry.instancePath && <code>{entry.instancePath}</code>}
                    </div>
                    <time>{formatDateTime(entry.at)}</time>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {page === 'settings' && (
          <section className="content settings">
            <article className="settings-card">
              <div className="settings-head">
                <Icon name="sun" size={19} />
                <div>
                  <h2>外观</h2>
                  <p>主题会立即应用，并用于下次启动。</p>
                </div>
              </div>
              <div className="theme-options">
                {(
                  [
                    ['light', 'sun', '浅色'],
                    ['system', 'monitor', '跟随系统'],
                    ['dark', 'moon', '深色'],
                  ] as const
                ).map(([value, icon, label]) => (
                  <button
                    key={value}
                    className={theme === value ? 'theme-option active' : 'theme-option'}
                    onClick={() => void changeTheme(value)}
                  >
                    <Icon name={icon} size={20} />
                    {label}
                  </button>
                ))}
              </div>
            </article>

            <article className="settings-card">
              <div className="settings-head">
                <Icon name="download" size={19} />
                <div>
                  <h2>版本与更新</h2>
                  <p>通过 GitHub Releases 分发；仅在点击时检查，不自动下载或安装。</p>
                </div>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>当前版本</dt>
                  <dd>v{bootstrap.version}</dd>
                </div>
                <div>
                  <dt>更新渠道</dt>
                  <dd>GitHub Releases</dd>
                </div>
              </dl>
              <div className="update-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void checkUpdates()}
                  disabled={updateState.phase === 'checking'}
                >
                  {updateState.phase === 'checking' ? '正在检查…' : '检查更新'}
                </button>
                <button className="btn btn-ghost" onClick={() => void openExternal(bootstrap.releasesUrl)}>
                  打开发布页
                </button>
              </div>
              {updateState.phase === 'error' && (
                <div className="notice notice-danger update-result">
                  <Icon name="alert" size={16} />
                  <p>检查更新失败：{updateState.error}</p>
                </div>
              )}
              {updateState.phase === 'done' &&
                (updateState.data.hasUpdate ? (
                  <div className="notice notice-warning update-result">
                    <Icon name="download" size={16} />
                    <p>
                      发现新版本 v{updateState.data.latestVersion}（当前 v{updateState.data.currentVersion}
                      {releaseDate && `，发布于 ${releaseDate}`}）。请从发布页下载安装包手动更新。
                    </p>
                  </div>
                ) : updateState.data.latestVersion === null ? (
                  <div className="notice update-result">
                    <Icon name="info" size={16} />
                    <p>仓库尚未发布 Release，暂无可更新版本。</p>
                  </div>
                ) : (
                  <div className="notice update-result">
                    <Icon name="check" size={16} />
                    <p>已是最新版本（v{updateState.data.latestVersion}）。</p>
                  </div>
                ))}
              <p className="settings-hint">
                检查更新只读取 GitHub 最新 Release 的版本号，不上传本机安装与汉化信息。
              </p>
            </article>

            <article className="settings-card">
              <div className="settings-head">
                <Icon name="folder" size={19} />
                <div>
                  <h2>数据与备份</h2>
                  <p>所有记录保存在本机，不上传。</p>
                </div>
              </div>
              <div className="path-row">
                <div>
                  <span className="label">应用数据</span>
                  <code>{bootstrap.dataDir}</code>
                </div>
                <button className="btn btn-ghost" onClick={() => void openPath('data')}>
                  打开
                </button>
              </div>
              <div className="path-row">
                <div>
                  <span className="label">备份目录</span>
                  <code>{bootstrap.backupRoot}</code>
                </div>
                <button className="btn btn-ghost" onClick={() => void openPath('backups')}>
                  打开
                </button>
              </div>
              <div className="path-row">
                <div>
                  <span className="label">Claude Code 配置</span>
                  <code>{bootstrap.settingsPath}</code>
                </div>
                <button className="btn btn-ghost" onClick={() => void openPath('settings')}>
                  打开
                </button>
              </div>
              <p className="settings-hint">
                卸载汉化时会保留历史备份；卸载管理端不会自动删除这些备份。
              </p>
            </article>

            <article className="settings-card">
              <div className="settings-head">
                <Icon name="plug" size={19} />
                <div>
                  <h2>内置汉化资源</h2>
                  <p>Claude Code 简体中文插件通过官方插件扩展点加载。</p>
                </div>
              </div>
              <dl className="detail-grid">
                <div>
                  <dt>插件版本</dt>
                  <dd>{bootstrap.pluginSource.version ?? '不可用'}</dd>
                </div>
                <div>
                  <dt>插件要求</dt>
                  <dd>Claude Code CLI ≥ 2.1.287</dd>
                </div>
                <div>
                  <dt>应用版本</dt>
                  <dd>v{bootstrap.version}</dd>
                </div>
                <div>
                  <dt>平台</dt>
                  <dd>
                    {bootstrap.platform === 'win32'
                      ? 'Windows'
                      : bootstrap.platform === 'darwin'
                        ? 'macOS'
                        : bootstrap.platform === 'linux'
                          ? 'Linux'
                          : bootstrap.platform}
                  </dd>
                </div>
              </dl>
              {bootstrap.pluginSource.error && (
                <div className="notice notice-danger">
                  <Icon name="alert" size={16} />
                  <p>{bootstrap.pluginSource.error}</p>
                </div>
              )}
              <p className="settings-hint">
                插件覆盖斜杠命令说明、/config、Spinner、提示行、通知等部分界面；权限对话框等位置由
                Claude Code 引擎独占绘制，无法汉化。
              </p>
            </article>
          </section>
        )}
      </main>

      {drawerTool && drawerResult && (
        <DetailsDrawer
          tool={drawerTool}
          result={drawerResult}
          instanceId={selectedInstanceIds[drawerTool.id] ?? null}
          manualPath={manualPath(drawerTool.id)}
          onSelectInstance={(id) => setSelectedInstanceIds((current) => ({ ...current, [drawerTool.id]: id }))}
          onClose={() => setDrawerToolId(null)}
          onApply={(instance) => void openPreview(drawerTool.id, 'apply', instance)}
          onUninstall={(instance) => void openPreview(drawerTool.id, 'uninstall', instance)}
          onChoosePath={() => void choosePath(drawerTool.id)}
          onClearPath={() => void clearPath(drawerTool.id)}
          busy={busy || detecting}
        />
      )}

      {dialog && (
        <ConfirmDialog
          plan={dialog.plan}
          busy={dialogBusy}
          error={dialogError}
          onConfirm={() => void confirmDialog()}
          onClose={() => {
            if (!dialogBusy) setDialog(null)
          }}
        />
      )}

      {toast && (
        <div className={`toast tone-${toast.tone}`} role="status">
          <Icon name={toast.tone === 'success' ? 'check' : toast.tone === 'danger' ? 'alert' : 'info'} size={17} />
          {toast.message}
        </div>
      )}
    </div>
  )
}
