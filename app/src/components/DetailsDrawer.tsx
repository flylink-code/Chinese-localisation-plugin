import type { ToolDefinition, ToolInstance, ToolResult } from '../types'
import { Icon } from './Icon'
import { InstallPill, StatusPill } from './StatusPill'

function capability(instance: ToolInstance, kind: 'apply' | 'uninstall') {
  return instance.capabilities.find((item) => item.kind === kind)
}

export function DetailsDrawer({
  tool,
  result,
  instanceId,
  manualPath,
  onSelectInstance,
  onClose,
  onApply,
  onUninstall,
  onChoosePath,
  onClearPath,
  busy,
}: {
  tool: ToolDefinition
  result: ToolResult
  instanceId: string | null
  manualPath: string | null
  onSelectInstance: (id: string) => void
  onClose: () => void
  onApply: (instance: ToolInstance) => void
  onUninstall: (instance: ToolInstance) => void
  onChoosePath: () => void
  onClearPath: () => void
  busy: boolean
}) {
  const instances = result.instances
  const selected = instances.find((item) => item.id === instanceId) ?? instances[0] ?? null
  const scanning = result.status === 'idle' || result.status === 'scanning'
  const apply = selected ? capability(selected, 'apply') : undefined
  const uninstall = selected ? capability(selected, 'uninstall') : undefined

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${tool.name} 详情`}>
        <header className="drawer-head">
          <div className="tool-icon" style={{ ['--tool-accent' as string]: tool.accent }}>
            <Icon name={tool.icon} size={22} />
          </div>
          <div className="drawer-heading">
            <h2>{tool.name}</h2>
            <p>{tool.summary}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭详情">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="drawer-body">
          {scanning ? (
            <div className="drawer-loading">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line short" />
            </div>
          ) : result.status === 'error' ? (
            <div className="notice notice-danger">
              <Icon name="alert" size={18} />
              <div>
                <strong>检测失败</strong>
                <p>{result.error}</p>
              </div>
            </div>
          ) : !selected ? (
            <div className="empty-drawer">
              <div className="empty-icon">
                <Icon name="folder" size={26} />
              </div>
              <h3>未发现安装</h3>
              <p>{result.notes[0] ?? '本机已知位置没有找到该软件。'}</p>
              {manualPath && (
                <p className="manual-hint">
                  已指定：<code>{manualPath}</code>
                </p>
              )}
              <div className="empty-actions">
                <button className="btn btn-primary" onClick={onChoosePath} disabled={busy}>
                  <Icon name="folder" size={16} />
                  选择安装目录
                </button>
                {manualPath && (
                  <button className="btn btn-ghost" onClick={onClearPath} disabled={busy}>
                    清除指定路径
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {instances.length > 1 && (
                <section className="drawer-section">
                  <h3>安装实例</h3>
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

              <section className="drawer-section">
                <div className="section-title-row">
                  <h3>汉化状态</h3>
                  <StatusPill state={selected.localization.state} label={selected.localization.label} />
                </div>
                <p className="section-detail">{selected.localization.detail}</p>
                {selected.localization.coverage.length > 0 && (
                  <div className="coverage-box">
                    <span className="label">覆盖范围</span>
                    <ul>
                      {selected.localization.coverage.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="drawer-section">
                <h3>安装信息</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>产品形态</dt>
                    <dd>{selected.formLabel}</dd>
                  </div>
                  <div>
                    <dt>版本</dt>
                    <dd>{selected.version ? `v${selected.version}` : '未读取到'}</dd>
                  </div>
                  <div>
                    <dt>安装渠道</dt>
                    <dd>{selected.channel}</dd>
                  </div>
                  <div>
                    <dt>版本来源</dt>
                    <dd>{selected.versionSource ?? '—'}</dd>
                  </div>
                </dl>
                <div className="path-box">
                  <span className="label">安装路径</span>
                  <code>{selected.path}</code>
                </div>
                {manualPath && (
                  <div className="manual-row">
                    <span>手动指定：{manualPath}</span>
                    <button className="link-btn" onClick={onClearPath} disabled={busy}>
                      清除
                    </button>
                  </div>
                )}
                <button className="btn btn-quiet" onClick={onChoosePath} disabled={busy}>
                  <Icon name="folder" size={15} />
                  更换安装路径
                </button>
              </section>

              <section className="drawer-section">
                <h3>检测依据</h3>
                <ul className="evidence-list">
                  {selected.evidence.map((item) => (
                    <li key={item}>
                      <Icon name="check" size={14} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {selected.warnings.length > 0 && (
                <section className="drawer-section">
                  <h3>注意事项</h3>
                  {selected.warnings.map((item) => (
                    <div className="notice notice-warning" key={item}>
                      <Icon name="alert" size={16} />
                      <p>{item}</p>
                    </div>
                  ))}
                </section>
              )}

              {result.notes.length > 0 && (
                <section className="drawer-section">
                  <h3>检测说明</h3>
                  {result.notes.map((item) => (
                    <p className="muted-line" key={item}>
                      {item}
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
        </div>

        {selected && result.status !== 'error' && (
          <footer className="drawer-foot">
            {uninstall?.enabled ? (
              <button className="btn btn-danger" onClick={() => onUninstall(selected)} disabled={busy}>
                <Icon name="trash" size={16} />
                卸载汉化
              </button>
            ) : apply?.enabled ? (
              <button className="btn btn-primary" onClick={() => onApply(selected)} disabled={busy}>
                <Icon name="download" size={16} />
                应用汉化
              </button>
            ) : (
              <button className="btn btn-ghost" disabled title={apply?.reason}>
                <Icon name="shield" size={16} />
                当前不可修改
              </button>
            )}
            <p className="foot-hint">
              {uninstall?.enabled
                ? '卸载汉化只恢复由本软件写入的插件配置，不卸载目标软件。'
                : apply?.enabled
                  ? '应用前会展示变更并备份配置文件。'
                  : apply?.reason ?? '当前实例没有可用的汉化操作。'}
            </p>
          </footer>
        )}
      </aside>
    </>
  )
}
