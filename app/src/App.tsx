import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { CustomToolModal } from './components/CustomToolModal'
import { DetailsDrawer } from './components/DetailsDrawer'
import { Icon } from './components/Icon'
import { type CardAction, ToolCard } from './components/ToolCard'
import type {
  AppConfig,
  Bootstrap,
  CustomToolItem,
  DetectEvent,
  ExternalEvent,
  ExternalSourceInfo,
  HistoryEntry,
  RepoConfig,
  ToolDefinition,
  ToolId,
  ToolInstance,
  ToolResult,
  UpdateStatus,
} from './types'

type Page = 'apps' | 'history' | 'settings'
type StatusFilter = 'all' | 'localized' | 'pending'

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: '全部状态',
  localized: '已汉化',
  pending: '未汉化',
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

export default function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ToolResult>>({})
  const [detecting, setDetecting] = useState(false)
  const [lastDetected, setLastDetected] = useState<string | null>(null)
  const [page, setPage] = useState<Page>('apps')
  const [query, setQuery] = useState('')
  const [installedOnly, setInstalledOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [drawerToolId, setDrawerToolId] = useState<ToolId | null>(null)
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Record<string, string>>({})
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(null)
  const [externalProgress, setExternalProgress] = useState<ExternalEvent | null>(null)
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'danger' | 'info' } | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [mirrorDraft, setMirrorDraft] = useState('')
  const [updateBusy, setUpdateBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const runIdRef = useRef<string | null>(null)
  const resultsRef = useRef<Record<string, ToolResult>>({})
  const toastTimer = useRef<number | null>(null)

  resultsRef.current = results

  const showToast = useCallback((message: string, tone: 'success' | 'danger' | 'info' = 'info') => {
    setToast({ message, tone })
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 4600)
  }, [])

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await api.listHistory())
    } catch (error) {
      showToast(`读取操作记录失败：${(error as Error).message}`, 'danger')
    }
  }, [showToast])

  const runDetection = useCallback(
    async (toolsOverride?: ToolDefinition[]) => {
      const targetTools = toolsOverride ?? bootstrap?.tools
      if (!targetTools || detecting) return
      const runId = crypto.randomUUID()
      runIdRef.current = runId
      const previous = resultsRef.current
      setDetecting(true)
      setResults((current) => {
        const next = { ...current }
        for (const tool of targetTools) next[tool.id] = { ...idleResult(tool.id), status: 'scanning' }
        return next
      })
      try {
        const output = await api.detect(runId)
        if (output.cancelled) {
          setResults(previous)
          showToast('已取消检测', 'info')
        } else {
          const merged: Record<string, ToolResult> = {}
          for (const tool of targetTools) {
            merged[tool.id] =
              output.results.find((item) => item.toolId === tool.id) ?? {
                ...idleResult(tool.id),
                status: 'error',
                error: '未返回检测结果',
              }
          }
          setResults(merged)
          setLastDetected(new Date().toISOString())
        }
      } catch (error) {
        setResults(previous)
        showToast(`检测失败：${(error as Error).message}`, 'danger')
      } finally {
        runIdRef.current = null
        setDetecting(false)
      }
    },
    [bootstrap?.tools, detecting, showToast],
  )

  useEffect(() => {
    let cancelled = false
    api
      .bootstrap()
      .then((info) => {
        if (cancelled) return
        setBootstrap(info)
        setTheme(info.theme)
        setMirrorDraft(info.config.update.mirror)
        setUpdateStatus(info.updateStatus)
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
    void runDetection(bootstrap.tools)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.version])

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
    return api.onUpdateEvent((status) => setUpdateStatus(status))
  }, [])

  useEffect(() => {
    return api.onExternalEvent((event) => setExternalProgress(event))
  }, [])

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
      if (event.key !== 'Escape' || busy) return
      if (showCustomModal) setShowCustomModal(false)
      else if (drawerToolId) setDrawerToolId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, showCustomModal, drawerToolId])

  const tools = bootstrap?.tools ?? []
  const toolMap = useMemo(() => new Map(tools.map((tool) => [tool.id, tool])), [tools])
  const sourceMap = useMemo(() => {
    const map = new Map<string, ExternalSourceInfo>()
    for (const src of bootstrap?.externalSources ?? []) {
      map.set(src.id, src)
    }
    return map
  }, [bootstrap?.externalSources])

  const stats = useMemo(() => {
    let installed = 0
    let localized = 0
    for (const tool of tools) {
      const result = results[tool.id]
      if (!result) continue
      if (result.status === 'ok') installed += 1
      const primary = result.instances[0]
      if (primary && isLocalized(primary.localization.state)) localized += 1
    }
    return { installed, localized }
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
      if (keyword) {
        const src = sourceMap.get(tool.id)
        const haystack = [
          tool.name,
          tool.vendor,
          tool.summary,
          src?.repo ?? '',
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
  }, [tools, results, installedOnly, statusFilter, query, sourceMap])

  const drawerTool = drawerToolId ? toolMap.get(drawerToolId) ?? null : null
  const drawerResult = drawerTool ? results[drawerTool.id] : null
  const drawerSource = drawerTool ? sourceMap.get(drawerTool.id) ?? null : null
  const manualPath = (toolId: ToolId) => bootstrap?.config.manualPaths?.[toolId] ?? null

  const updateBootstrapState = (patch: Partial<Bootstrap>) => {
    setBootstrap((current) => (current ? { ...current, ...patch } : current))
  }

  const updateConfig = (config: AppConfig) => {
    setBootstrap((current) => (current ? { ...current, config } : current))
  }

  const choosePath = async (toolId: ToolId) => {
    setBusy(true)
    try {
      const output = await api.choosePath(toolId)
      if (output.canceled || !output.config) return
      updateConfig(output.config)
      showToast('安装目录已更新，正在重新检测…', 'success')
      await runDetection()
    } catch (error) {
      showToast(`选择目录失败：${(error as Error).message}`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const clearPath = async (toolId: ToolId) => {
    setBusy(true)
    try {
      const output = await api.clearPath(toolId)
      updateConfig(output.config)
      showToast('已恢复自动检测路径', 'success')
      await runDetection()
    } catch (error) {
      showToast(`清除路径失败：${(error as Error).message}`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  /** 一键同步 GitHub 汉化仓库最新代码 */
  const executeSyncRepo = async (toolId: ToolId) => {
    setBusy(true)
    setActiveToolId(toolId)
    setExternalProgress({ toolId, phase: 'download', message: '正在连接 GitHub 同步最新仓库代码…' })
    try {
      const output = await api.syncRepo({ toolId })
      updateBootstrapState({ externalSources: output.externalSources })
      showToast(output.message, 'success')
      await refreshHistory()
    } catch (error) {
      showToast(`同步仓库失败：${(error as Error).message}`, 'danger')
    } finally {
      setBusy(false)
      setActiveToolId(null)
      setExternalProgress(null)
    }
  }

  /** 直接执行一键汉化 / 重新汉化（无预览弹窗） */
  const executeApply = async (toolId: ToolId, instance?: ToolInstance | null) => {
    const target = instance ?? results[toolId]?.instances[0] ?? null
    setBusy(true)
    setActiveToolId(toolId)
    setExternalProgress({ toolId, phase: 'prepare', message: '正在准备并执行汉化配置…' })
    try {
      const output = await api.applyLocalization({
        toolId,
        instanceId: target?.id ?? '',
      })
      if (output.externalSources) {
        updateBootstrapState({ externalSources: output.externalSources })
      }
      showToast(output.message, 'success')
      await runDetection()
      await refreshHistory()
    } catch (error) {
      showToast(`汉化执行失败：${(error as Error).message}`, 'danger')
      await runDetection()
      await refreshHistory()
    } finally {
      setBusy(false)
      setActiveToolId(null)
      setExternalProgress(null)
    }
  }

  /** 直接执行恢复原版 */
  const executeUninstall = async (toolId: ToolId, instance?: ToolInstance | null) => {
    const target = instance ?? results[toolId]?.instances[0] ?? null
    setBusy(true)
    setActiveToolId(toolId)
    setExternalProgress({ toolId, phase: 'uninstall', message: '正在运行还原脚本恢复原版…' })
    try {
      const output = await api.uninstallLocalization({
        toolId,
        instanceId: target?.id,
      })
      showToast(output.message, 'success')
      await runDetection()
      await refreshHistory()
    } catch (error) {
      showToast(`恢复原版失败：${(error as Error).message}`, 'danger')
      await runDetection()
      await refreshHistory()
    } finally {
      setBusy(false)
      setActiveToolId(null)
      setExternalProgress(null)
    }
  }

  /** 直接执行仓库附加配置动作（如禁更新、同步技能） */
  const executeExtraAction = async (toolId: ToolId, actionId: string) => {
    const target = results[toolId]?.instances[0] ?? null
    setBusy(true)
    setActiveToolId(toolId)
    setExternalProgress({ toolId, phase: 'extra', message: '正在执行仓库配置命令…' })
    try {
      const output = await api.runExtraAction({
        toolId,
        actionId,
        instanceId: target?.id,
      })
      showToast(output.message, 'success')
      await refreshHistory()
    } catch (error) {
      showToast((error as Error).message, 'danger')
    } finally {
      setBusy(false)
      setActiveToolId(null)
      setExternalProgress(null)
    }
  }

  /** 即改即存卡片上的可视化参数 */
  const handleOptionChange = async (toolId: ToolId, key: string, value: unknown) => {
    try {
      const output = await api.setToolOptions({
        toolId,
        options: { [key]: value },
      })
      updateBootstrapState({
        config: output.config,
        externalSources: output.externalSources,
      })
    } catch (error) {
      showToast(`保存选项失败：${(error as Error).message}`, 'danger')
    }
  }

  /** 保存工具的 GitHub 仓库地址与分支配置 */
  const handleSaveRepo = async (toolId: ToolId, repoConfig: RepoConfig | null, andSync = false) => {
    setBusy(true)
    try {
      const output = await api.setRepoConfig({ toolId, repoConfig })
      updateBootstrapState({
        config: output.config,
        externalSources: output.externalSources,
      })
      showToast(repoConfig ? `已绑定仓库 ${repoConfig.repo}@${repoConfig.branch}` : '已恢复默认 GitHub 仓库', 'success')
    } catch (error) {
      showToast(`保存仓库配置失败：${(error as Error).message}`, 'danger')
      setBusy(false)
      return
    }
    setBusy(false)
    if (andSync) {
      await executeSyncRepo(toolId)
    }
  }

  const handleSaveCustomTool = async (item: Partial<CustomToolItem>) => {
    setBusy(true)
    try {
      const output = await api.saveCustomTool(item)
      updateBootstrapState({
        config: output.config,
        tools: output.tools,
        externalSources: output.externalSources,
      })
      setShowCustomModal(false)
      showToast(`已添加「${output.tool.name}」并绑定仓库 ${output.tool.repo}`, 'success')
      await runDetection(output.tools)
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveCustomTool = async (toolId: ToolId) => {
    setBusy(true)
    try {
      const output = await api.removeCustomTool(toolId)
      updateBootstrapState({
        config: output.config,
        tools: output.tools,
        externalSources: output.externalSources,
      })
      setDrawerToolId(null)
      showToast('已删除该自定义软件配置', 'info')
      await runDetection(output.tools)
    } catch (error) {
      showToast(`删除失败：${(error as Error).message}`, 'danger')
    } finally {
      setBusy(false)
    }
  }

  const handleCardAction = (tool: ToolDefinition, action: CardAction) => {
    if (action === 'choose-path') {
      void choosePath(tool.id)
      return
    }
    if (action === 'sync-repo') {
      void executeSyncRepo(tool.id)
      return
    }
    if (action === 'details') {
      setDrawerToolId(tool.id)
      return
    }
    if (action === 'apply') {
      void executeApply(tool.id)
      return
    }
    if (action === 'uninstall') {
      void executeUninstall(tool.id)
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

  const openPath = async (kind: 'data' | 'backups' | 'plugins' | 'sources' | 'logs' | 'settings') => {
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
    setUpdateBusy(true)
    try {
      setUpdateStatus(await api.checkUpdates())
    } catch (error) {
      showToast(`检查更新失败：${(error as Error).message}`, 'danger')
    } finally {
      setUpdateBusy(false)
    }
  }

  const downloadUpdate = async () => {
    setUpdateBusy(true)
    try {
      setUpdateStatus(await api.downloadUpdate())
    } catch (error) {
      showToast(`下载更新失败：${(error as Error).message}`, 'danger')
    } finally {
      setUpdateBusy(false)
    }
  }

  const installUpdate = async () => {
    try {
      await api.installUpdate()
    } catch (error) {
      showToast(`安装更新失败：${(error as Error).message}`, 'danger')
    }
  }

  const setAutoCheck = async (autoCheck: boolean) => {
    try {
      const output = await api.setUpdateConfig({ autoCheck })
      setUpdateStatus(output.status)
      setBootstrap((current) =>
        current ? { ...current, config: { ...current.config, update: output.config } } : current,
      )
    } catch (error) {
      showToast(`保存自动检查设置失败：${(error as Error).message}`, 'danger')
    }
  }

  const saveMirror = async () => {
    try {
      const output = await api.setUpdateConfig({ mirror: mirrorDraft })
      setMirrorDraft(output.config.mirror)
      setUpdateStatus(output.status)
      setBootstrap((current) =>
        current ? { ...current, config: { ...current.config, update: output.config } } : current,
      )
      showToast(output.config.mirror ? 'GitHub 镜像已保存（同步仓库与检查更新均生效）' : '已恢复使用 GitHub 官方源', 'success')
    } catch (error) {
      showToast(`保存镜像地址失败：${(error as Error).message}`, 'danger')
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
    setInstalledOnly(false)
  }

  if (!bootstrap) {
    return (
      <div className="app-loading">
        <div className="brand-mark large">汉</div>
        <p>{bootError ? `启动失败：${bootError}` : '正在加载…'}</p>
      </div>
    )
  }

  const pageTitle = page === 'apps' ? '多软件 GitHub 汉化工作台' : page === 'history' ? '操作记录' : '设置'
  const releaseDate = formatReleaseDate(updateStatus?.releaseDate ?? null)
  const sep = bootstrap.platform === 'win32' ? '\\' : '/'
  const pageSubtitle =
    page === 'apps'
      ? '绑定 GitHub 汉化仓库，将繁琐的控制台命令与参数变成可视化配置，点一下直接执行。'
      : page === 'history'
        ? '查看仓库同步、一键汉化、附加配置与恢复原版的执行记录。'
        : 'GitHub 镜像加速、外观主题、缓存目录与应用更新。'

  return (
    <div className="app-shell">
      <div className="titlebar-drag" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">汉</div>
          <div className="brand-text">
            <strong>汉化管家</strong>
            <span>GitHub 仓库配置工作台</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          <button className={page === 'apps' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('apps')}>
            <Icon name="apps" size={18} />
            软件工作台
            <span className="nav-count">{tools.length}</span>
          </button>
          <button className={page === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('history')}>
            <Icon name="history" size={18} />
            操作记录
          </button>
          <button className={page === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('settings')}>
            <Icon name="settings" size={18} />
            设置与镜像
            {(updateStatus?.phase === 'available' || updateStatus?.phase === 'downloaded') && (
              <span className="nav-dot" aria-label="有可用更新" />
            )}
          </button>
        </nav>

        <div className="sidebar-note">
          <Icon name="sparkles" size={16} />
          <p>每个软件绑定一个 GitHub 汉化仓库，支持一键同步最新代码与可视化参数配置。</p>
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
                    placeholder="搜索软件、仓库或路径"
                    aria-label="搜索软件"
                  />
                  {query && (
                    <button className="search-clear" onClick={() => setQuery('')} aria-label="清除搜索">
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </label>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setShowCustomModal(true)}
                >
                  <Icon name="plug" size={16} />
                  + 添加软件配置
                </button>
                {detecting ? (
                  <button className="btn btn-ghost" onClick={() => void cancelDetection()}>
                    <span className="spinner" aria-hidden="true" />
                    取消检测
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => void runDetection()} disabled={busy}>
                    <Icon name="refresh" size={16} />
                    刷新状态
                  </button>
                )}
              </>
            )}
            {page === 'history' && (
              <>
                <button className="btn btn-ghost" onClick={() => void openPath('logs')}>
                  <Icon name="folder" size={16} />
                  打开日志目录
                </button>
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
              <button className="btn btn-primary" onClick={() => void runDetection()} disabled={detecting || busy}>
                <Icon name="refresh" size={16} />
                重新扫描软件
              </button>
            )}
          </div>
        </header>

        {page === 'apps' && (
          <section className="content">
            <div className="toolbar">
              <div className="segmented" role="group" aria-label="安装筛选">
                <button
                  className={!installedOnly ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => setInstalledOnly(false)}
                >
                  全部软件
                  <span>{tools.length}</span>
                </button>
                <button
                  className={installedOnly ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => setInstalledOnly(true)}
                >
                  已检测到目录
                  <span>{stats.installed}</span>
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
                  </button>
                ))}
              </div>
              <div className="detect-meta">
                <span>{detecting ? '正在检测…' : `最近刷新：${formatTime(lastDetected)}`}</span>
              </div>
            </div>

            <div className="tool-grid workbench-grid">
              {visibleTools.map((tool) => {
                const isCardBusy = busy && activeToolId === tool.id
                const progressText =
                  isCardBusy && externalProgress?.toolId === tool.id
                    ? externalProgress.message
                    : isCardBusy
                      ? '正在执行…'
                      : null
                return (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    result={results[tool.id] ?? idleResult(tool.id)}
                    source={sourceMap.get(tool.id) ?? null}
                    busyMessage={progressText}
                    disabled={busy}
                    onOpen={() => setDrawerToolId(tool.id)}
                    onAction={(action) => handleCardAction(tool, action)}
                    onChangeOption={(key, value) => void handleOptionChange(tool.id, key, value)}
                    onExtraAction={(actionId) => void executeExtraAction(tool.id, actionId)}
                    onOpenExternal={(url) => void openExternal(url)}
                  />
                )
              })}
            </div>

            {visibleTools.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="search" size={26} />
                </div>
                <h3>没有匹配的软件卡片</h3>
                <p>可以重置筛选条件，或点击右上角「+ 添加软件配置」绑定新的软件与 GitHub 汉化仓库。</p>
                <button className="btn btn-ghost" onClick={resetFilters}>
                  重置筛选
                </button>
              </div>
            )}
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
                <p>执行同步仓库、一键汉化或恢复原版后，结果会记录在这里。</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((entry) => (
                  <article className="history-item" key={entry.id}>
                    <span className={`history-icon ${entry.result === 'success' ? 'success' : 'danger'}`}>
                      <Icon name={entry.action === 'uninstall' ? 'trash' : 'download'} size={17} />
                    </span>
                    <div className="history-body">
                      <div className="history-title">
                        <strong>{entry.toolName}</strong>
                        <span className="history-action">
                          {entry.action === 'apply'
                            ? '一键汉化'
                            : entry.action === 'uninstall'
                              ? '恢复原版'
                              : entry.action === 'sync'
                                ? '同步仓库'
                                : entry.action}
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
                <Icon name="download" size={19} />
                <div>
                  <h2>GitHub 镜像加速与应用更新</h2>
                  <p>配置 GitHub 镜像后，「同步最新仓库」与「软件更新检查」都会自动优先通过镜像拉取。</p>
                </div>
              </div>

              <div className="mirror-row" style={{ marginTop: 0 }}>
                <label htmlFor="mirror-url">GitHub 镜像加速地址（可选）</label>
                <div className="mirror-input">
                  <input
                    id="mirror-url"
                    value={mirrorDraft}
                    onChange={(event) => setMirrorDraft(event.target.value)}
                    placeholder="例如 https://ghfast.top（留空则直连 GitHub）"
                    spellCheck={false}
                  />
                  <button className="btn btn-primary" onClick={() => void saveMirror()} disabled={updateBusy}>
                    保存镜像
                  </button>
                </div>
              </div>

              <label className="switch-row">
                <span>
                  <strong>启动时自动检查汉化管家更新</strong>
                  <small>当前版本 v{bootstrap.version}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={updateStatus?.autoCheck ?? bootstrap.config.update.autoCheck}
                  onChange={(event) => void setAutoCheck(event.target.checked)}
                />
              </label>

              <div className="update-actions">
                <button
                  className="btn btn-ghost"
                  onClick={() => void checkUpdates()}
                  disabled={
                    updateBusy || updateStatus?.phase === 'checking' || updateStatus?.phase === 'downloading'
                  }
                >
                  {updateStatus?.phase === 'checking' ? '正在检查…' : '检查本软件更新'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => void openExternal(updateStatus?.releaseUrl || bootstrap.releasesUrl)}
                >
                  打开 GitHub Releases
                </button>
                {updateStatus?.phase === 'available' && updateStatus.canAutoInstall && (
                  <button className="btn btn-primary" onClick={() => void downloadUpdate()} disabled={updateBusy}>
                    <Icon name="download" size={16} />
                    下载新版本 v{updateStatus.latestVersion}
                  </button>
                )}
                {updateStatus?.phase === 'downloaded' && (
                  <button className="btn btn-primary" onClick={() => void installUpdate()}>
                    <Icon name="refresh" size={16} />
                    安装并重启
                  </button>
                )}
              </div>

              {updateStatus?.phase === 'available' && (
                <div className="notice notice-warning update-result">
                  <Icon name="download" size={16} />
                  <p>
                    发现新版本 v{updateStatus.latestVersion}（当前 v{updateStatus.currentVersion}
                    {releaseDate && `，发布于 ${releaseDate}`}）。
                  </p>
                </div>
              )}
              {updateStatus?.phase === 'up-to-date' && (
                <div className="notice update-result">
                  <Icon name="check" size={16} />
                  <p>当前已是最新版本（v{updateStatus.latestVersion ?? updateStatus.currentVersion}）。</p>
                </div>
              )}
              {updateStatus?.phase === 'error' && (
                <div className="notice notice-danger update-result">
                  <Icon name="alert" size={16} />
                  <p>更新检查失败：{updateStatus.error}</p>
                </div>
              )}
            </article>

            <article className="settings-card">
              <div className="settings-head">
                <Icon name="sun" size={19} />
                <div>
                  <h2>外观主题</h2>
                  <p>切换浅色、深色或跟随系统主题。</p>
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
                <Icon name="folder" size={19} />
                <div>
                  <h2>本地目录与仓库缓存</h2>
                  <p>管理同步到本地的 GitHub 汉化仓库、备份文件与执行日志。</p>
                </div>
              </div>
              <div className="path-row">
                <div>
                  <span className="label">GitHub 汉化仓库缓存目录</span>
                  <code>{`${bootstrap.dataDir}${sep}sources`}</code>
                </div>
                <button className="btn btn-ghost" onClick={() => void openPath('sources')}>
                  打开
                </button>
              </div>
              <div className="path-row">
                <div>
                  <span className="label">执行日志目录</span>
                  <code>{`${bootstrap.dataDir}${sep}logs`}</code>
                </div>
                <button className="btn btn-ghost" onClick={() => void openPath('logs')}>
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
                  <span className="label">Claude Code 配置文件</span>
                  <code>{bootstrap.settingsPath}</code>
                </div>
                <button className="btn btn-ghost" onClick={() => void openPath('settings')}>
                  打开
                </button>
              </div>
            </article>

            <article className="settings-card">
              <div className="settings-head">
                <Icon name="plug" size={19} />
                <div>
                  <h2>已绑定的 GitHub 汉化仓库</h2>
                  <p>各软件汉化脚本与词库版权归对应 GitHub 开源仓库作者所有。</p>
                </div>
              </div>
              {bootstrap.externalSources.map((source) => (
                <div className="path-row" key={source.id}>
                  <div>
                    <span className="label">{source.name}</span>
                    <code>
                      {source.repo}@{source.branch || 'main'}
                    </code>
                  </div>
                  <button className="btn btn-ghost" onClick={() => void openExternal(source.homepage)}>
                    打开 GitHub
                  </button>
                </div>
              ))}
            </article>
          </section>
        )}
      </main>

      {drawerTool && drawerResult && (
        <DetailsDrawer
          tool={drawerTool}
          result={drawerResult}
          source={drawerSource}
          instanceId={selectedInstanceIds[drawerTool.id] ?? null}
          manualPath={manualPath(drawerTool.id)}
          onSelectInstance={(id) => setSelectedInstanceIds((current) => ({ ...current, [drawerTool.id]: id }))}
          onClose={() => setDrawerToolId(null)}
          onApply={(instance) => void executeApply(drawerTool.id, instance)}
          onUninstall={(instance) => void executeUninstall(drawerTool.id, instance)}
          onChoosePath={() => void choosePath(drawerTool.id)}
          onClearPath={() => void clearPath(drawerTool.id)}
          onSaveRepo={(repoConfig, andSync) => void handleSaveRepo(drawerTool.id, repoConfig, andSync)}
          onSyncRepo={() => void executeSyncRepo(drawerTool.id)}
          onRemoveCustomTool={drawerTool.custom ? () => void handleRemoveCustomTool(drawerTool.id) : undefined}
          onOpenLink={(url) => void openExternal(url)}
          busy={busy || detecting}
        />
      )}

      {showCustomModal && (
        <CustomToolModal
          busy={busy}
          onSave={handleSaveCustomTool}
          onClose={() => {
            if (!busy) setShowCustomModal(false)
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
