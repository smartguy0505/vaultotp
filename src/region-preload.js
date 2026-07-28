const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('regionApi', {
  onInit: (callback) => {
    ipcRenderer.on('region:init', (_event, payload) => callback(payload));
  },
  confirm: (rect) => ipcRenderer.send('region:result', { ok: true, rect }),
  cancel: () => ipcRenderer.send('region:result', { ok: false, canceled: true }),
});
