const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  status: () => ipcRenderer.invoke('vault:status'),
  setup: (password) => ipcRenderer.invoke('vault:setup', password),
  unlock: (password) => ipcRenderer.invoke('vault:unlock', password),
  lock: () => ipcRenderer.invoke('vault:lock'),
  list: () => ipcRenderer.invoke('vault:list'),
  getSecret: (id) => ipcRenderer.invoke('vault:getSecret', id),
  add: (account) => ipcRenderer.invoke('vault:add', account),
  update: (id, patch) => ipcRenderer.invoke('vault:update', id, patch),
  remove: (id) => ipcRenderer.invoke('vault:remove', id),
  codes: () => ipcRenderer.invoke('vault:codes'),
  changePassword: (currentPassword, newPassword) =>
    ipcRenderer.invoke('vault:changePassword', currentPassword, newPassword),
  exportBackup: (password) => ipcRenderer.invoke('vault:export', password),
  importPick: () => ipcRenderer.invoke('vault:importPick'),
  importBackup: (filePath, password, replace) =>
    ipcRenderer.invoke('vault:import', filePath, password, replace),
  scanQrImage: () => ipcRenderer.invoke('qr:scanImage'),
  scanQrScreen: () => ipcRenderer.invoke('qr:scanScreen'),
  copy: (text, options) => ipcRenderer.invoke('clipboard:write', text, options),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (callback) => {
    const handler = (_event, maximized) => callback(maximized);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
});
