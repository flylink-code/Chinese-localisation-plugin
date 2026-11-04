import type { PreviewPlan } from '../types'
import { Icon } from './Icon'

const actionIcon: Record<PreviewPlan['action'], string> = {
  apply: 'download',
  uninstall: 'trash',
}

const actionVerb: Record<PreviewPlan['action'], string> = {
  apply: '确认应用汉化',
  uninstall: '确认卸载汉化',
}

const changeIcon: Record<string, string> = {
  create: 'download',
  update: 'settings',
  delete: 'trash',
  keep: 'shield',
}

export function ConfirmDialog({
  plan,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  plan: PreviewPlan
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className={`modal-icon ${plan.action === 'uninstall' ? 'danger' : 'primary'}`}>
            <Icon name={actionIcon[plan.action]} size={22} />
          </div>
          <div>
            <h2 id="confirm-title">{plan.title}</h2>
            <p>请确认本次变更。应用前会自动备份配置文件。</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭" disabled={busy}>
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="modal-body">
          <section>
            <h3>将执行的变更</h3>
            <ul className="change-list">
              {plan.changes.map((change) => (
                <li key={`${change.action}-${change.file}`}>
                  <span className={`change-badge action-${change.action}`}>
                    <Icon name={changeIcon[change.action] ?? 'info'} size={14} />
                  </span>
                  <span className="change-body">
                    <span className="change-summary">{change.summary}</span>
                    <code>{change.file}</code>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3>覆盖范围</h3>
            <ul className="plain-list">
              {plan.coverage.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          {plan.requirements.length > 0 && (
            <section>
              <h3>前置条件</h3>
              <ul className="plain-list">
                {plan.requirements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          {plan.warnings.length > 0 && (
            <section>
              <h3>注意事项</h3>
              {plan.warnings.map((item) => (
                <div className="notice notice-warning" key={item}>
                  <Icon name="alert" size={16} />
                  <p>{item}</p>
                </div>
              ))}
            </section>
          )}

          {error && (
            <div className="notice notice-danger" role="alert">
              <Icon name="alert" size={16} />
              <p>{error}</p>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className={`btn ${plan.action === 'uninstall' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? '正在处理…' : actionVerb[plan.action]}
          </button>
        </footer>
      </div>
    </div>
  )
}
