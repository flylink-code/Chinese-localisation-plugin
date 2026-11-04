import type { LocalizationState } from '../types'

const toneMap: Record<LocalizationState, string> = {
  managed: 'success',
  native: 'success',
  external: 'info',
  stale: 'warning',
  partial: 'warning',
  unknown: 'neutral',
  none: 'muted',
}

export function StatusPill({ state, label }: { state: LocalizationState; label: string }) {
  return (
    <span className={`status-pill tone-${toneMap[state] ?? 'muted'}`}>
      <span className="status-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

export function InstallPill({ installed }: { installed: boolean }) {
  return (
    <span className={`status-pill ${installed ? 'tone-installed' : 'tone-muted'}`}>
      <span className="status-dot" aria-hidden="true" />
      {installed ? '已安装' : '未安装'}
    </span>
  )
}
