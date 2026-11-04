import type { ExternalSourceInfo, ToolDefinition, ToolResult } from '../types'
import { Icon } from './Icon'
import { StatusPill } from './StatusPill'

export type CardAction = 'apply' | 'uninstall' | 'details' | 'choose-path' | 'sync-repo'

export function ToolCard({
  tool,
  result,
  source,
  busyMessage,
  disabled,
  onOpen,
  onAction,
  onChangeOption,
  onExtraAction,
  onOpenExternal,
}: {
  tool: ToolDefinition
  result: ToolResult
  source: ExternalSourceInfo | null
  busyMessage: string | null
  disabled: boolean
  onOpen: () => void
  onAction: (action: CardAction) => void
  onChangeOption: (key: string, value: unknown) => void
  onExtraAction: (actionId: string) => void
  onOpenExternal: (url: string) => void
}) {
  const scanning = result.status === 'idle' || result.status === 'scanning'
  if (scanning) {
    return (
      <article className="tool-card skeleton-card" aria-busy="true" aria-label={`正在检测 ${tool.name}`}>
        <div className="skeleton-row">
          <span className="skeleton skeleton-icon" />
          <span className="skeleton skeleton-title" />
        </div>
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line short" />
        <div className="skeleton-row footer">
          <span className="skeleton skeleton-chip" />
          <span className="skeleton skeleton-button" />
        </div>
      </article>
    )
  }

  const primary = result.instances[0] ?? null
  const installed = result.instances.length > 0
  const error = result.status === 'error'
  const applyCap = primary?.capabilities.find((item) => item.kind === 'apply')
  const uninstallCap = primary?.capabilities.find((item) => item.kind === 'uninstall')
  const isLocalized =
    primary?.localization.state === 'managed' || primary?.localization.state === 'external'

  const optionSchema = source?.optionSchema ?? []
  const currentOptions = source?.options ?? {}
  const extraActions = source?.extraActions ?? []

  return (
    <article
      className={`tool-card workbench-card ${installed ? '' : 'is-missing'} ${error ? 'has-error' : ''}`}
      aria-label={`${tool.name} 配置卡片`}
    >
      {/* 1. 顶部软件标识与状态 */}
      <div className="card-head">
        <div className="tool-icon" style={{ ['--tool-accent' as string]: tool.accent || '#4c63e6' }}>
          <Icon name={tool.icon || 'apps'} size={22} />
        </div>
        <div className="card-title">
          <div className="card-title-row">
            <h3>{tool.name}</h3>
            {primary?.version && <span className="version-badge">v{primary.version}</span>}
          </div>
          <span className="card-vendor">
            {tool.vendor}
            {primary ? ` · ${primary.channel}` : ` · ${tool.forms.join(' / ')}`}
          </span>
        </div>
        {error ? (
          <span className="status-pill tone-danger">
            <span className="status-dot" aria-hidden="true" />
            检测失败
          </span>
        ) : installed ? (
          <StatusPill state={primary!.localization.state} label={primary!.localization.label} />
        ) : (
          <span className="status-pill tone-muted">
            <span className="status-dot" aria-hidden="true" />
            未检测到目录
          </span>
        )}
      </div>

      {/* 2. 本地安装路径栏 */}
      <div className="card-path-bar">
        <Icon name="folder" size={14} />
        <span className="path-text" title={primary?.path ?? '未发现安装位置，请点击右侧按钮指定目录'}>
          {primary?.path ?? '未发现安装位置，请点击右侧按钮指定目录'}
        </span>
        <button
          type="button"
          className="mini-btn"
          disabled={disabled}
          onClick={() => onAction('choose-path')}
          title="手动选择或更换软件安装目录"
        >
          选目录
        </button>
      </div>

      {/* 3. GitHub 汉化仓库栏 */}
      {source && (
        <div className="repo-bar">
          <div className="repo-bar-main">
            <span className="repo-label">GitHub 仓库</span>
            <button
              type="button"
              className="repo-slug-btn"
              onClick={() => onOpenExternal(source.homepage)}
              title={`在浏览器打开 ${source.homepage}`}
            >
              <code>{source.repo}</code>
              <span className="repo-branch">@{source.branch || 'main'}</span>
            </button>
            <span className={`repo-cache-tag ${source.cached || tool.id === 'claude-code' ? 'ready' : 'pending'}`}>
              {source.cached ? '已同步' : tool.id === 'claude-code' ? '内置+在线' : '按需拉取'}
            </span>
          </div>
          <div className="repo-bar-actions">
            <button
              type="button"
              className="mini-btn"
              disabled={disabled}
              onClick={() => onAction('sync-repo')}
              title="从 GitHub 拉取该仓库分支的最新代码"
            >
              <Icon name="refresh" size={12} />
              同步最新
            </button>
            <button
              type="button"
              className="mini-btn"
              disabled={disabled}
              onClick={onOpen}
              title="切换预设仓库或自定义 GitHub 仓库地址与分支"
            >
              <Icon name="settings" size={12} />
              换源
            </button>
          </div>
        </div>
      )}

      {/* 4. 可视化配置项（替代命令行参数与控制台菜单） */}
      {(optionSchema.length > 0 || extraActions.length > 0) && (
        <div className="card-options">
          {optionSchema.map((field) => {
            if (field.type === 'select' && field.choices) {
              const value = String(currentOptions[field.key] ?? field.choices[0]?.value ?? '')
              return (
                <div className="opt-row" key={field.key}>
                  <span className="opt-label">{field.label}</span>
                  <select
                    className="opt-select"
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChangeOption(field.key, event.target.value)}
                  >
                    {field.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </div>
              )
            }
            if (field.type === 'boolean') {
              const checked = Boolean(currentOptions[field.key])
              return (
                <label className="opt-row opt-toggle" key={field.key} title={field.hint}>
                  <span className="opt-label">{field.label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => onChangeOption(field.key, event.target.checked)}
                  />
                </label>
              )
            }
            return null
          })}

          {extraActions.length > 0 && installed && (
            <div className="extra-actions-group">
              <span className="opt-label">仓库附加功能（点一下直接执行）</span>
              <div className="extra-actions-row">
                {extraActions.map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    className="chip-action-btn"
                    disabled={disabled}
                    title={act.summary}
                    onClick={() => onExtraAction(act.id)}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. 实时执行状态条 */}
      {busyMessage && (
        <div className="card-progress" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>{busyMessage}</span>
        </div>
      )}

      {/* 6. 底部一键执行栏（无弹窗确认，直接执行） */}
      <div className="card-foot workbench-foot">
        {!installed ? (
          <>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={disabled}
              onClick={() => onAction('choose-path')}
            >
              <Icon name="folder" size={15} />
              指定安装目录
            </button>
            <button type="button" className="btn btn-ghost" disabled={disabled} onClick={onOpen}>
              仓库配置
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={disabled || !applyCap?.enabled}
              title={applyCap?.reason}
              onClick={() => onAction('apply')}
            >
              {busyMessage ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  正在执行…
                </>
              ) : (
                <>
                  <Icon name="download" size={15} />
                  {isLocalized ? '重新汉化' : '一键汉化'}
                </>
              )}
            </button>
            {uninstallCap?.enabled && (
              <button
                type="button"
                className="btn btn-danger-ghost"
                disabled={disabled}
                title={uninstallCap.reason}
                onClick={() => onAction('uninstall')}
              >
                恢复原版
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={disabled}
              onClick={onOpen}
              title="配置 GitHub 仓库、切换分支或选择多实例"
            >
              配置
            </button>
          </>
        )}
      </div>
    </article>
  )
}
