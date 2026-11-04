export type ToolId = 'claude-code' | 'claude-desktop' | 'antigravity'

export interface ToolDefinition {
  id: ToolId
  name: string
  vendor: string
  summary: string
  icon: string
  accent: string
  forms: string[]
}

export type LocalizationState = 'none' | 'managed' | 'external' | 'stale' | 'unknown' | 'native' | 'partial'

export interface LocalizationStatus {
  state: LocalizationState
  label: string
  detail: string
  evidence: string[]
  coverage: string[]
}

export type CapabilityKind = 'apply' | 'uninstall'

export interface Capability {
  kind: CapabilityKind
  enabled: boolean
  reason?: string
}

export interface ToolInstance {
  id: string
  toolId: ToolId
  form: string
  formLabel: string
  name: string
  path: string
  version: string | null
  versionSource: string | null
  channel: string
  evidence: string[]
  localization: LocalizationStatus
  warnings: string[]
  installed: boolean
  capabilities: Capability[]
}

export type ToolStatus = 'idle' | 'scanning' | 'ok' | 'not-installed' | 'error' | 'cancelled'

export interface ToolResult {
  toolId: ToolId
  status: ToolStatus
  instances: ToolInstance[]
  notes: string[]
  error: string | null
  scannedAt: string | null
  durationMs: number
}

export interface DetectEvent {
  runId: string
  type: 'tool-start' | 'tool-result' | 'tool-error' | 'complete'
  toolId?: ToolId
  result?: ToolResult
}

export interface UpdateConfig {
  autoCheck: boolean
  mirror: string
}

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
}

export interface UpdateStatus {
  phase: UpdatePhase
  currentVersion: string
  latestVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
  releaseUrl: string
  progress: UpdateProgress | null
  error: string | null
  autoCheck: boolean
  mirror: string
  canCheck: boolean
  canAutoInstall: boolean
  installHint: string | null
}

export interface AppConfig {
  manualPaths: Partial<Record<ToolId, string>>
  theme: 'system' | 'light' | 'dark'
  update: UpdateConfig
}

export interface Bootstrap {
  tools: ToolDefinition[]
  version: string
  releasesUrl: string
  platform: string
  dataDir: string
  settingsPath: string
  backupRoot: string
  config: AppConfig
  pluginSource: { version: string | null; error?: string }
  theme: 'system' | 'light' | 'dark'
  updateStatus: UpdateStatus
}

export interface PreviewChange {
  file: string
  action: 'create' | 'update' | 'delete' | 'keep'
  summary: string
}

export interface PreviewPlan {
  action: 'apply' | 'uninstall'
  title: string
  instancePath: string | null
  pluginVersion: string
  requirements: string[]
  changes: PreviewChange[]
  coverage: string[]
  warnings: string[]
}

export interface OperationResult {
  ok: boolean
  message: string
  backupDir?: string
}

export interface HistoryEntry {
  id: string
  at: string
  action: 'apply' | 'uninstall'
  toolId: ToolId
  toolName: string
  instancePath: string | null
  result: 'success' | 'failed'
  summary: string
}

export interface LocaliserApi {
  bootstrap: () => Promise<Bootstrap>
  detect: (runId: string) => Promise<{ cancelled: boolean; results: ToolResult[] }>
  cancelDetect: (runId: string) => Promise<{ cancelled: boolean }>
  onDetectEvent: (callback: (event: DetectEvent) => void) => () => void
  choosePath: (toolId: ToolId) => Promise<{ canceled: boolean; config?: AppConfig; path?: string }>
  clearPath: (toolId: ToolId) => Promise<{ config: AppConfig }>
  previewLocalization: (payload: {
    toolId: ToolId
    action: 'apply' | 'uninstall'
    instance?: ToolInstance | null
    instanceId?: string
  }) => Promise<PreviewPlan>
  applyLocalization: (payload: {
    toolId: ToolId
    instanceId: string
  }) => Promise<OperationResult>
  uninstallLocalization: (payload: { toolId: ToolId }) => Promise<OperationResult>
  listHistory: () => Promise<HistoryEntry[]>
  openPath: (kind: 'data' | 'backups' | 'plugins' | 'settings') => Promise<{ ok: boolean }>
  setTheme: (theme: 'system' | 'light' | 'dark') => Promise<{ ok: boolean }>
  getUpdateStatus: () => Promise<UpdateStatus>
  checkUpdates: () => Promise<UpdateStatus>
  downloadUpdate: () => Promise<UpdateStatus>
  installUpdate: () => Promise<{ ok: boolean }>
  setUpdateConfig: (payload: Partial<UpdateConfig>) => Promise<{ config: UpdateConfig; status: UpdateStatus }>
  onUpdateEvent: (callback: (status: UpdateStatus) => void) => () => void
  openExternal: (url: string) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    localiser: LocaliserApi
  }
}
