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
  checkUpdates: () => ipcRenderer.invoke('app:check-updates'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
})
