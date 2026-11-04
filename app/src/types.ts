export type ToolId = string

export interface ToolDefinition {
  id: ToolId
  name: string
  vendor: string
  category?: string
  summary: string
  icon?: string
  accent?: string
  forms: string[]
  custom?: boolean
  path?: string
}

export type LocalizationState = 'none' | 'managed' | 'external' | 'stale' | 'unknown' | 'native' | 'partial'

export interface ExternalPlugin {
  id: string
  name: string
  path: string
  version: string | null
  enabled: boolean
}

export interface LocalizationStatus {
  state: LocalizationState
  label: string
  detail: string
  evidence: string[]
  coverage: string[]
  externalPlugins?: ExternalPlugin[]
}

export type CapabilityKind = 'apply' | 'uninstall'

export interface Capability {
  kind: CapabilityKind
  enabled: boolean
  label?: string
  reason?: string
}

export interface OptionChoice {
  value: string
  label: string
}

export interface OptionSchemaItem {
  key: string
  label: string
  type: 'select' | 'boolean'
  choices?: OptionChoice[]
  hint?: string
}

export interface ExtraActionItem {
  id: string
  label: string
  args: string[]
  summary: string
}

export interface RepoPreset {
  id: string
  label: string
  repo: string
  branch: string
  subDir?: string
  entry: string
  uninstallEntry?: string
  installArgs?: string[]
  uninstallArgs?: string[]
  runner?: string
  elevated?: boolean
}

export interface RepoConfig {
  repo: string
  branch: string
  entry?: string
  uninstallEntry?: string
  subDir?: string
  runner?: string
  elevated?: boolean
  installArgs?: string[] | string
  uninstallArgs?: string[] | string
}

export interface CustomToolItem {
  id?: string
  name: string
  vendor?: string
  path: string
  repo: string
  branch: string
  runner: 'electron-node' | 'powershell'
  entry: string
  uninstallEntry?: string
  installArgs?: string[] | string
  uninstallArgs?: string[] | string
  elevated?: boolean
}

export interface ExternalSourceInfo {
  id: string
  toolName?: string
  name: string
  repo: string
  branch: string
  commit: string | null
  shortCommit: string
  license: string | null
  versionText: string
  homepage: string
  archiveSha256: string | null
  runner: string
  entry: string
  uninstallEntry?: string
  installArgs?: string[]
  uninstallArgs?: string[]
  subDir?: string
  elevated: boolean
  platforms: string[]
  coverage: string[]
  warnings: string[]
  optionSchema: OptionSchemaItem[]
  options: Record<string, unknown>
  extraActions: ExtraActionItem[]
  presets: RepoPreset[]
  cached?: boolean
  syncedAt?: string | null
  localCommit?: string | null
  localDir?: string
  verified?: boolean
}

export interface SupportNote {
  summary: string
  details: string[]
  link?: { label: string; url: string }
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
  support?: SupportNote
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
  manualPaths: Record<string, string>
  theme: 'system' | 'light' | 'dark'
  update: UpdateConfig
  repoConfigs?: Record<string, RepoConfig>
  toolOptions?: Record<string, Record<string, unknown>>
  customTools?: CustomToolItem[]
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
  pluginSource: {
    version: string | null
    name?: string
    author?: string | null
    license?: string | null
    sourceUrl?: string
    error?: string
  }
  externalSources: ExternalSourceInfo[]
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
  takeover?: boolean
  source?: ExternalSourceInfo
}

export interface OperationResult {
  ok: boolean
  message: string
  backupDir?: string
  logPath?: string
  externalSources?: ExternalSourceInfo[]
}

export interface ExternalEvent {
  toolId: ToolId
  phase: string
  message: string
}

export interface HistoryEntry {
  id: string
  at: string
  action: string
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
  pickDirectory: (title?: string) => Promise<{ canceled: boolean; path: string | null }>
  clearPath: (toolId: ToolId) => Promise<{ config: AppConfig }>
  syncRepo: (payload: { toolId: ToolId }) => Promise<{
    ok: boolean
    message: string
    externalSources: ExternalSourceInfo[]
  }>
  setRepoConfig: (payload: {
    toolId: ToolId
    repoConfig: RepoConfig | null
  }) => Promise<{ ok: boolean; config: AppConfig; externalSources: ExternalSourceInfo[] }>
  setToolOptions: (payload: {
    toolId: ToolId
    options: Record<string, unknown>
  }) => Promise<{ ok: boolean; config: AppConfig; externalSources: ExternalSourceInfo[] }>
  runExtraAction: (payload: {
    toolId: ToolId
    actionId: string
    instanceId?: string
    options?: Record<string, unknown>
  }) => Promise<OperationResult>
  saveCustomTool: (item: Partial<CustomToolItem>) => Promise<{
    ok: boolean
    config: AppConfig
    tool: CustomToolItem
    tools: ToolDefinition[]
    externalSources: ExternalSourceInfo[]
  }>
  removeCustomTool: (toolId: ToolId) => Promise<{
    ok: boolean
    config: AppConfig
    tools: ToolDefinition[]
    externalSources: ExternalSourceInfo[]
  }>
  previewLocalization: (payload: {
    toolId: ToolId
    action: 'apply' | 'uninstall'
    instance?: ToolInstance | null
    instanceId?: string
  }) => Promise<PreviewPlan>
  applyLocalization: (payload: {
    toolId: ToolId
    instanceId: string
    options?: Record<string, unknown>
  }) => Promise<OperationResult>
  uninstallLocalization: (payload: {
    toolId: ToolId
    instanceId?: string
    options?: Record<string, unknown>
  }) => Promise<OperationResult>
  onExternalEvent: (callback: (event: ExternalEvent) => void) => () => void
  listHistory: () => Promise<HistoryEntry[]>
  openPath: (kind: 'data' | 'backups' | 'plugins' | 'sources' | 'logs' | 'settings') => Promise<{ ok: boolean }>
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
