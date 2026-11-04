'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('localiser', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  detect: (runId) => ipcRenderer.invoke('detect:run', runId),
  cancelDetect: (runId) => ipcRenderer.invoke('detect:cancel', runId),
  onDetectEvent: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('detect:event', listener)
    return () => ipcRenderer.removeListener('detect:event', listener)
  },
  choosePath: (toolId) => ipcRenderer.invoke('path:choose', toolId),
  clearPath: (toolId) => ipcRenderer.invoke('path:clear', toolId),
  previewLocalization: (payload) => ipcRenderer.invoke('localization:preview', payload),
  applyLocalization: (payload) => ipcRenderer.invoke('localization:apply', payload),
  uninstallLocalization: (payload) => ipcRenderer.invoke('localization:uninstall', payload),
  listHistory: () => ipcRenderer.invoke('history:list'),
  openPath: (kind) => ipcRenderer.invoke('app:open-path', kind),
  setTheme: (theme) => ipcRenderer.invoke('app:set-theme', theme),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  setUpdateConfig: (payload) => ipcRenderer.invoke('update:set-config', payload),
  onUpdateEvent: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('update:event', listener)
    return () => ipcRenderer.removeListener('update:event', listener)
  },
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
})
