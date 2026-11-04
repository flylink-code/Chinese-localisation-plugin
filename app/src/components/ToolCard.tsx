import type { ToolDefinition, ToolResult } from '../types'
import { Icon } from './Icon'
import { StatusPill } from './StatusPill'

type PrimaryAction = 'apply' | 'uninstall' | 'details' | 'choose-path'

function resolvePrimaryAction(result: ToolResult): PrimaryAction {
  if (result.status === 'not-installed' || result.instances.length === 0) return 'choose-path'
  const primary = result.instances[0]
  if (primary.capabilities.find((item) => item.kind === 'uninstall')?.enabled) return 'uninstall'
  if (primary.capabilities.find((item) => item.kind === 'apply')?.enabled) return 'apply'
  return 'details'
}

const actionLabel: Record<PrimaryAction, string> = {
  apply: '应用汉化',
  uninstall: '卸载汉化',
  details: '查看详情',
  'choose-path': '指定安装路径',
}

export function ToolCard({
  tool,
  result,
  onOpen,
  onAction,
}: {
  tool: ToolDefinition
  result: ToolResult
  onOpen: () => void
  onAction: (action: PrimaryAction) => void
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
  const action = resolvePrimaryAction(result)
  const installed = result.instances.length > 0
  const error = result.status === 'error'

  return (
    <article
      className={`tool-card ${installed ? '' : 'is-missing'} ${error ? 'has-error' : ''}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${tool.name}，${primary?.localization.label ?? (error ? '检测失败' : '未安装')}，查看详情`}
    >
      <div className="card-head">
        <div className="tool-icon" style={{ ['--tool-accent' as string]: tool.accent }}>
          <Icon name={tool.icon} size={22} />
        </div>
        <div className="card-title">
          <h3>{tool.name}</h3>
          <span className="card-vendor">
            {tool.vendor}
            {primary ? ` · ${primary.formLabel}` : ` · ${tool.forms.join(' / ')}`}
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
            未安装
          </span>
        )}
      </div>

      <p className="card-summary">
        {error ? result.error : primary?.localization.detail ?? result.notes[0] ?? tool.summary}
      </p>

      <dl className="card-meta">
        <div>
          <dt>版本</dt>
          <dd>{primary?.version ? `v${primary.version}` : '—'}</dd>
        </div>
        <div>
          <dt>渠道</dt>
          <dd>{primary?.channel ?? '—'}</dd>
        </div>
        <div>
          <dt>实例</dt>
          <dd>{installed ? `${result.instances.length} 个` : '0 个'}</dd>
        </div>
      </dl>

      <div className="card-foot">
        <span className="path-text" title={primary?.path ?? '未发现安装位置'}>
          {primary?.path ?? '未发现安装位置'}
        </span>
        <button
          className={`btn ${action === 'uninstall' ? 'btn-danger-ghost' : action === 'apply' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={(event) => {
            event.stopPropagation()
            onAction(action)
          }}
        >
          {actionLabel[action]}
        </button>
      </div>
    </article>
  )
}
