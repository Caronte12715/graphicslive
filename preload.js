const { contextBridge, ipcRenderer } = require('electron');

// API segura expuesta al renderer (Control Panel)
contextBridge.exposeInMainWorld('api', {
  // Estado del servidor
  getServerStatus: () => ipcRenderer.invoke('server:status'),

  // Sincronizar proyecto con panel remoto
  syncProject: (data) => ipcRenderer.invoke('project:sync', data),

  // Túnel público
  startTunnel: (subdomain) => ipcRenderer.invoke('tunnel:start', subdomain),
  stopTunnel: () => ipcRenderer.invoke('tunnel:stop'),
  getTunnelStatus: () => ipcRenderer.invoke('tunnel:status'),

  // Control de gráficos
  triggerGraphic: (payload) => ipcRenderer.invoke('graphic:trigger', payload),

  // Diálogos de archivo
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  loadProject: () => ipcRenderer.invoke('dialog:loadProject'),
  saveProject: (data) => ipcRenderer.invoke('dialog:saveProject', data),

  // Archivos
  readHTML: (filePath) => ipcRenderer.invoke('file:readHTML', filePath),

  // Templates
  listTemplates: () => ipcRenderer.invoke('templates:list'),

  // Outputs
  openOutputInBrowser: (url) => ipcRenderer.invoke('output:openInBrowser', url),
  addOutput: () => ipcRenderer.invoke('output:add'),
  removeOutput: (id) => ipcRenderer.invoke('output:remove', id),

  // Utils
  generateQR: (text) => ipcRenderer.invoke('utils:generateQR', text),
});
