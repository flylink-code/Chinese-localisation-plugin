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
  progress,
  onConfirm,
  onClose,
}: {
  plan: PreviewPlan
  busy: boolean
  error: string | null
  progress: string | null
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
            <p>
              {plan.source
                ? '确认后将从 GitHub 下载固定提交并运行上游安装器，请完整阅读来源与风险。'
                : '请确认本次变更。应用前会自动备份配置文件。'}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭" disabled={busy}>
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="modal-body">
          {plan.source && (
            <section>
              <h3>汉化来源</h3>
              <dl className="detail-grid">
                <div>
                  <dt>上游仓库</dt>
                  <dd>github.com/{plan.source.repo}</dd>
                </div>
                <div>
                  <dt>固定提交</dt>
                  <dd>
                    <code>{plan.source.shortCommit}</code>
                  </dd>
                </div>
                <div>
                  <dt>许可证</dt>
                  <dd>{plan.source.license ?? '上游未声明'}</dd>
                </div>
                <div>
                  <dt>兼容版本</dt>
                  <dd>{plan.source.versionText}</dd>
                </div>
                <div>
                  <dt>归档校验</dt>
                  <dd>
                    <code>{plan.source.archiveSha256 ? `${plan.source.archiveSha256.slice(0, 16)}…` : '最新分支'}</code>
                  </dd>
                </div>
                <div>
                  <dt>下载状态</dt>
                  <dd>{plan.source.verified ? '已下载并通过 SHA-256 校验' : '确认后下载并校验'}</dd>
                </div>
              </dl>
            </section>
          )}

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

          {progress && (
            <div className="notice update-result" role="status">
              <span className="spinner" aria-hidden="true" />
              <p>{progress}</p>
            </div>
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
            {busy
              ? '正在处理…'
              : plan.action === 'apply' && plan.source
                ? '确认下载并安装'
                : plan.action === 'apply' && plan.takeover
                  ? '确认替换外部汉化'
                  : actionVerb[plan.action]}
          </button>
        </footer>
      </div>
    </div>
  )
}
