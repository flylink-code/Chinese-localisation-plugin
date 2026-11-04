import { useState } from 'react'
import { api } from '../api'
import type { CustomToolItem } from '../types'
import { Icon } from './Icon'

interface QuickTemplate {
  id: string
  title: string
  subtitle: string
  name: string
  vendor: string
  repo: string
  branch: string
  runner: 'electron-node' | 'powershell'
  entry: string
  uninstallEntry: string
  installArgs: string
  uninstallArgs: string
  elevated: boolean
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'cursor-lidefang',
    title: 'Cursor IDE（推荐）',
    subtitle: 'lidefang0918/cursor-zh · 精确适配 3.27/3.28',
    name: 'Cursor',
    vendor: 'Anysphere',
    repo: 'lidefang0918/cursor-zh',
    branch: 'main',
    runner: 'electron-node',
    entry: 'scripts/run.mjs',
    uninstallEntry: '',
    installArgs: 'localize --close --no-relaunch --offline --root={path}',
    uninstallArgs: 'revert --close --no-relaunch --root={path}',
    elevated: false,
  },
  {
    id: 'cursor-i18n-zh',
    title: 'Cursor（轻量版）',
    subtitle: 'baishi1114010/cursor-i18n-zh · 54★ Node 零依赖',
    name: 'Cursor',
    vendor: 'Anysphere',
    repo: 'baishi1114010/cursor-i18n-zh',
    branch: 'main',
    runner: 'electron-node',
    entry: 'index.js',
    uninstallEntry: '',
    installArgs: 'localize -p {path}',
    uninstallArgs: 'restore -p {path}',
    elevated: false,
  },
  {
    id: 'codex-desktop-zh',
    title: 'Codex Desktop',
    subtitle: 'aimiliya825/codex-desktop-zh-cn · 免改包一键汉化',
    name: 'Codex Desktop',
    vendor: 'OpenAI',
    repo: 'aimiliya825/codex-desktop-zh-cn',
    branch: 'main',
    runner: 'powershell',
    entry: 'Install-CodexZh.ps1',
    uninstallEntry: 'Restore-CodexZh.ps1',
    installArgs: '-Yes -NoPause -LocaleOnly',
    uninstallArgs: '-Yes -NoPause',
    elevated: false,
  },
  {
    id: 'codex-portable-zh',
    title: 'Codex 便携汉化',
    subtitle: 'shuai-liu001/codex-zh · 生成独立中文便携版',
    name: 'Codex 便携版',
    vendor: 'OpenAI',
    repo: 'shuai-liu001/codex-zh',
    branch: 'main',
    runner: 'powershell',
    entry: 'Install-CodexZH.ps1',
    uninstallEntry: '',
    installArgs: '',
    uninstallArgs: '',
    elevated: false,
  },
  {
    id: 'kiro-language-pack',
    title: 'Kiro IDE',
    subtitle: 'polang233/kiro-language-pack · 语言包与界面补丁',
    name: 'Kiro',
    vendor: 'AWS Kiro',
    repo: 'polang233/kiro-language-pack',
    branch: 'main',
    runner: 'electron-node',
    entry: 'bin/cli.mjs',
    uninstallEntry: '',
    installArgs: 'install --locale=zh-cn --dir={path}',
    uninstallArgs: 'restore --dir={path}',
    elevated: false,
  },
  {
    id: 'opencode-zh-hans',
    title: 'OpenCode',
    subtitle: 'xlht4106/opencode-zh-hans · TUI 词典渲染插件',
    name: 'OpenCode',
    vendor: 'Anomaly',
    repo: 'xlht4106/opencode-zh-hans',
    branch: 'main',
    runner: 'electron-node',
    entry: 'translate.js',
    uninstallEntry: '',
    installArgs: '',
    uninstallArgs: '',
    elevated: false,
  },
]

export function CustomToolModal({
  busy,
  onSave,
  onClose,
}: {
  busy: boolean
  onSave: (item: Partial<CustomToolItem>) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('')
  const [targetPath, setTargetPath] = useState('')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [runner, setRunner] = useState<'electron-node' | 'powershell'>('electron-node')
  const [entry, setEntry] = useState('localization_engine.js')
  const [uninstallEntry, setUninstallEntry] = useState('')
  const [installArgs, setInstallArgs] = useState('')
  const [uninstallArgs, setUninstallArgs] = useState('--huifu')
  const [elevated, setElevated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyTemplate = (tpl: QuickTemplate) => {
    setName(tpl.name)
    setVendor(tpl.vendor)
    setRepo(tpl.repo)
    setBranch(tpl.branch)
    setRunner(tpl.runner)
    setEntry(tpl.entry)
    setUninstallEntry(tpl.uninstallEntry)
    setInstallArgs(tpl.installArgs)
    setUninstallArgs(tpl.uninstallArgs)
    setElevated(tpl.elevated)
    setError(null)
  }

  const browseDirectory = async () => {
    try {
      const picked = await api.pickDirectory('选择软件安装目录')
      if (!picked.canceled && picked.path) {
        setTargetPath(picked.path)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const submit = async () => {
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        vendor: vendor.trim() || '自定义软件',
        path: targetPath.trim(),
        repo: repo.trim(),
        branch: branch.trim() || 'main',
        runner,
        entry: entry.trim(),
        uninstallEntry: uninstallEntry.trim(),
        installArgs,
        uninstallArgs,
        elevated,
      })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="添加软件与 GitHub 汉化仓库配置"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-icon primary">
            <Icon name="plug" size={20} />
          </div>
          <div>
            <h2>添加软件与 GitHub 汉化仓库</h2>
            <p>可一键套用热门 Agent 汉化仓库模板，或绑定任意 GitHub 仓库与本地目录。</p>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="modal-body">
          <div className="preset-box" style={{ marginBottom: 12 }}>
            <span className="label">一键填入热门 Agent 软件近期汉化仓库模板</span>
            <div className="preset-list">
              {QUICK_TEMPLATES.map((tpl) => {
                const active = repo === tpl.repo && entry === tpl.entry
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    className={`preset-btn ${active ? 'active' : ''}`}
                    disabled={busy}
                    onClick={() => applyTemplate(tpl)}
                  >
                    <strong>{tpl.title}</strong>
                    <span>{tpl.subtitle}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="form-stack">
            <div className="form-row-2">
              <label className="form-field">
                <span>软件名称 *</span>
                <input
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="例如 Cursor / Codex / Kiro / OpenCode"
                />
              </label>
              <label className="form-field">
                <span>GitHub 汉化仓库 *</span>
                <input
                  value={repo}
                  disabled={busy}
                  onChange={(event) => setRepo(event.target.value)}
                  placeholder="owner/repo 或 https://github.com/..."
                  spellCheck={false}
                />
              </label>
            </div>

            <label className="form-field">
              <span>软件本地安装目录 *</span>
              <div className="mirror-input">
                <input
                  value={targetPath}
                  disabled={busy}
                  onChange={(event) => setTargetPath(event.target.value)}
                  placeholder="例如 F:\software\cursor 或 F:\software\Kiro"
                  spellCheck={false}
                />
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void browseDirectory()}>
                  <Icon name="folder" size={15} />
                  浏览…
                </button>
              </div>
            </label>

            <div className="form-row-2">
              <label className="form-field">
                <span>仓库分支 (Branch)</span>
                <input
                  value={branch}
                  disabled={busy}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="main"
                  spellCheck={false}
                />
              </label>
              <label className="form-field">
                <span>脚本执行器类型</span>
                <select
                  className="opt-select full-width"
                  value={runner}
                  disabled={busy}
                  onChange={(event) => {
                    const next = event.target.value as 'electron-node' | 'powershell'
                    setRunner(next)
                    if (next === 'powershell' && entry === 'localization_engine.js') {
                      setEntry('scripts/install_windows.ps1')
                    }
                  }}
                >
                  <option value="electron-node">Node.js 脚本 (.js / .mjs / .cjs)</option>
                  <option value="powershell">PowerShell 脚本 (.ps1)</option>
                </select>
              </label>
            </div>

            <div className="form-row-2">
              <label className="form-field">
                <span>安装入口脚本路径 *</span>
                <input
                  value={entry}
                  disabled={busy}
                  onChange={(event) => setEntry(event.target.value)}
                  placeholder="例如 index.js 或 Install-CodexZh.ps1"
                  spellCheck={false}
                />
              </label>
              <label className="form-field">
                <span>恢复入口脚本（可选，留空同安装入口）</span>
                <input
                  value={uninstallEntry}
                  disabled={busy}
                  onChange={(event) => setUninstallEntry(event.target.value)}
                  placeholder="例如 Restore-CodexZh.ps1 或 uninstall.js"
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="form-row-2">
              <label className="form-field">
                <span>安装参数（支持 &#123;path&#125; 占位符）</span>
                <input
                  value={installArgs}
                  disabled={busy}
                  onChange={(event) => setInstallArgs(event.target.value)}
                  placeholder="例如 localize -p {path}"
                  spellCheck={false}
                />
              </label>
              <label className="form-field">
                <span>恢复原版参数（支持 &#123;path&#125; 占位符）</span>
                <input
                  value={uninstallArgs}
                  disabled={busy}
                  onChange={(event) => setUninstallArgs(event.target.value)}
                  placeholder="例如 restore -p {path} 或 --huifu"
                  spellCheck={false}
                />
              </label>
            </div>

            {runner === 'powershell' && (
              <label className="opt-row opt-toggle">
                <span className="opt-label">执行时需要管理员权限（自动弹出 UAC 窗口）</span>
                <input
                  type="checkbox"
                  checked={elevated}
                  disabled={busy}
                  onChange={(event) => setElevated(event.target.checked)}
                />
              </label>
            )}
          </div>

          {error && (
            <div className="notice notice-danger">
              <Icon name="alert" size={16} />
              <p>{error}</p>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? (
              <>
                <span className="spinner" aria-hidden="true" />
                正在保存…
              </>
            ) : (
              '保存并添加卡片'
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
