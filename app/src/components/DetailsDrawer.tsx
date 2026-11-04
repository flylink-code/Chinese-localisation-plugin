import { useEffect, useState } from 'react'
import type { ExternalSourceInfo, RepoConfig, ToolDefinition, ToolInstance, ToolResult } from '../types'
import { Icon } from './Icon'
import { InstallPill, StatusPill } from './StatusPill'

function capability(instance: ToolInstance, kind: 'apply' | 'uninstall') {
  return instance.capabilities.find((item) => item.kind === kind)
}

export function DetailsDrawer({
  tool,
  result,
  source,
  instanceId,
  manualPath,
  onSelectInstance,
  onClose,
  onApply,
  onUninstall,
  onChoosePath,
  onClearPath,
  onSaveRepo,
  onSyncRepo,
  onRemoveCustomTool,
  onOpenLink,
  busy,
}: {
  tool: ToolDefinition
  result: ToolResult
  source: ExternalSourceInfo | null
  instanceId: string | null
  manualPath: string | null
  onSelectInstance: (id: string) => void
  onClose: () => void
  onApply: (instance: ToolInstance) => void
  onUninstall: (instance: ToolInstance) => void
  onChoosePath: () => void
  onClearPath: () => void
  onSaveRepo: (config: RepoConfig | null, andSync?: boolean) => void
  onSyncRepo: () => void
  onRemoveCustomTool?: () => void
  onOpenLink: (url: string) => void
  busy: boolean
}) {
  const instances = result.instances
  const selected = instances.find((item) => item.id === instanceId) ?? instances[0] ?? null
  const apply = selected ? capability(selected, 'apply') : undefined
  const uninstall = selected ? capability(selected, 'uninstall') : undefined

  const [repoInput, setRepoInput] = useState(source?.repo ?? '')
  const [branchInput, setBranchInput] = useState(source?.branch ?? 'main')
  const [entryInput, setEntryInput] = useState(source?.entry ?? '')
  const [uninstallEntryInput, setUninstallEntryInput] = useState(source?.uninstallEntry ?? '')
  const [subDirInput, setSubDirInput] = useState(source?.subDir ?? '')

  useEffect(() => {
    setRepoInput(source?.repo ?? '')
    setBranchInput(source?.branch ?? 'main')
    setEntryInput(source?.entry ?? '')
    setUninstallEntryInput(source?.uninstallEntry ?? '')
    setSubDirInput(source?.subDir ?? '')
  }, [source?.repo, source?.branch, source?.entry, source?.uninstallEntry, source?.subDir, tool.id])

  const presets = source?.presets ?? []

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${tool.name} 仓库与配置`}>
        <header className="drawer-head">
          <div className="tool-icon" style={{ ['--tool-accent' as string]: tool.accent || '#4c63e6' }}>
            <Icon name={tool.icon || 'apps'} size={22} />
          </div>
          <div className="drawer-heading">
            <h2>{tool.name} · 仓库与配置</h2>
            <p>配置绑定的 GitHub 汉化仓库、分支与目标安装路径</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭配置">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {/* 1. GitHub 汉化仓库配置 */}
          {source && (
            <section className="drawer-section">
              <div className="section-title-row">
                <h3>GitHub 汉化仓库配置</h3>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onOpenLink(`https://github.com/${repoInput || source.repo}`)}
                >
                  打开 GitHub 主页
                </button>
              </div>

              {presets.length > 0 && (
                <div className="preset-box">
                  <span className="label">快速切换预设仓库</span>
                  <div className="preset-list">
                    {presets.map((preset) => {
                      const active = repoInput === preset.repo && branchInput === (preset.branch || 'main')
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`preset-btn ${active ? 'active' : ''}`}
                          disabled={busy}
                          onClick={() => {
                            setRepoInput(preset.repo)
                            setBranchInput(preset.branch || 'main')
                            setEntryInput(preset.entry)
                            setUninstallEntryInput(preset.uninstallEntry || '')
                            setSubDirInput(preset.subDir || '')
                            onSaveRepo(
                              {
                                repo: preset.repo,
                                branch: preset.branch || 'main',
                                entry: preset.entry,
                                uninstallEntry: preset.uninstallEntry || '',
                                subDir: preset.subDir || '',
                                runner: preset.runner,
                                elevated: preset.elevated,
                                installArgs: preset.installArgs,
                                uninstallArgs: preset.uninstallArgs,
                              },
                              false,
                            )
                          }}
                        >
                          <strong>{preset.repo}</strong>
                          <span>{preset.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="form-stack">
                <label className="form-field">
                  <span>GitHub 仓库（owner/repo 或完整链接）</span>
                  <input
                    value={repoInput}
                    disabled={busy}
                    onChange={(event) => setRepoInput(event.target.value)}
                    placeholder="例如 Silas-02/antigravity-desktop-cn"
                    spellCheck={false}
                  />
                </label>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>分支 (Branch)</span>
                    <input
                      value={branchInput}
                      disabled={busy}
                      onChange={(event) => setBranchInput(event.target.value)}
                      placeholder="main"
                      spellCheck={false}
                    />
                  </label>
                  <label className="form-field">
                    <span>安装入口文件 (Entry)</span>
                    <input
                      value={entryInput}
                      disabled={busy}
                      onChange={(event) => setEntryInput(event.target.value)}
                      placeholder="localization_engine.js"
                      spellCheck={false}
                    />
                  </label>
                </div>
                <label className="form-field">
                  <span>恢复入口文件（可选，留空同安装入口）</span>
                  <input
                    value={uninstallEntryInput}
                    disabled={busy}
                    onChange={(event) => setUninstallEntryInput(event.target.value)}
                    placeholder="例如 uninstall.js 或 Restore-CodexZh.ps1"
                    spellCheck={false}
                  />
                </label>
              </div>

              <div className="drawer-repo-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !repoInput.trim()}
                  onClick={() =>
                    onSaveRepo(
                      {
                        repo: repoInput.trim(),
                        branch: branchInput.trim() || 'main',
                        entry: entryInput.trim(),
                        uninstallEntry: uninstallEntryInput.trim(),
                        subDir: subDirInput.trim(),
                      },
                      true,
                    )
                  }
                >
                  <Icon name="refresh" size={15} />
                  保存并同步最新代码
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || !repoInput.trim()}
                  onClick={() =>
                    onSaveRepo(
                      {
                        repo: repoInput.trim(),
                        branch: branchInput.trim() || 'main',
                        entry: entryInput.trim(),
                        uninstallEntry: uninstallEntryInput.trim(),
                        subDir: subDirInput.trim(),
                      },
                      false,
                    )
                  }
                >
                  仅保存
                </button>
                {!tool.custom && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => onSaveRepo(null, false)}
                  >
                    恢复默认源
                  </button>
                )}
              </div>

              <p className="muted-line" style={{ marginTop: 8 }}>
                缓存状态：{source.cached ? `已同步到本地（${source.syncedAt ? new Date(source.syncedAt).toLocaleString('zh-CN') : '就绪'}）` : '尚未拉取到本地（点击同步或汉化时自动拉取）'}
              </p>
            </section>
          )}

          {/* 2. 多实例选择 */}
          {instances.length > 1 && selected && (
            <section className="drawer-section">
              <h3>选择目标实例</h3>
              <div className="instance-list" role="radiogroup" aria-label="选择安装实例">
                {instances.map((item) => (
                  <label key={item.id} className={`instance-row ${item.id === selected.id ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="instance"
                      checked={item.id === selected.id}
                      onChange={() => onSelectInstance(item.id)}
                    />
                    <span className="instance-body">
                      <span className="instance-title">
                        {item.name}
                        <InstallPill installed={item.installed} />
                      </span>
                      <span className="instance-sub">
                        {item.channel} · {item.version ? `v${item.version}` : '版本未知'}
                      </span>
                    </span>
                    <StatusPill state={item.localization.state} label={item.localization.label} />
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* 3. 本地安装目录管理 */}
          <section className="drawer-section">
            <h3>软件本地安装位置</h3>
            {selected ? (
              <>
                <dl className="detail-grid">
                  <div>
                    <dt>当前状态</dt>
                    <dd>{selected.localization.label}</dd>
                  </div>
                  <div>
                    <dt>检测版本</dt>
                    <dd>{selected.version ? `v${selected.version}` : '通用'}</dd>
                  </div>
                </dl>
                <div className="path-box">
                  <span className="label">目标路径</span>
                  <code>{selected.path}</code>
                </div>
              </>
            ) : (
              <p className="muted-line">尚未检测到该软件的安装目录，请手动选择安装文件夹。</p>
            )}

            <div className="drawer-repo-actions" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={onChoosePath} disabled={busy}>
                <Icon name="folder" size={15} />
                选择安装目录
              </button>
              {manualPath && !tool.custom && (
                <button type="button" className="btn btn-ghost" onClick={onClearPath} disabled={busy}>
                  恢复自动检测
                </button>
              )}
              {tool.custom && onRemoveCustomTool && (
                <button type="button" className="btn btn-danger-ghost" onClick={onRemoveCustomTool} disabled={busy}>
                  <Icon name="trash" size={15} />
                  删除此自定义软件
                </button>
              )}
            </div>
          </section>
        </div>

        {selected && result.status !== 'error' && (
          <footer className="drawer-foot drawer-foot-row">
            <button
              type="button"
              className="btn btn-primary flex-1"
              onClick={() => onApply(selected)}
              disabled={busy || !apply?.enabled}
              title={apply?.reason}
            >
              <Icon name="download" size={16} />
              {selected.localization.state === 'managed' || selected.localization.state === 'external'
                ? '重新执行汉化'
                : '立即一键汉化'}
            </button>
            {uninstall?.enabled && (
              <button
                type="button"
                className="btn btn-danger-ghost"
                onClick={() => onUninstall(selected)}
                disabled={busy}
              >
                <Icon name="trash" size={16} />
                恢复原版
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onSyncRepo} disabled={busy}>
              <Icon name="refresh" size={16} />
              同步仓库
            </button>
          </footer>
        )}
      </aside>
    </>
  )
}
