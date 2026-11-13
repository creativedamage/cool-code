const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qrApi', {
  save: (buffer, defaultName, ext) => ipcRenderer.invoke('qr:save', { buffer, defaultName, ext }),
  copy: (buffer) => ipcRenderer.invoke('qr:copy', { buffer }),
  openDesign: () => ipcRenderer.invoke('qr:openDesign'),
  reveal: (filePath) => ipcRenderer.invoke('qr:reveal', filePath),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  platform: process.platform,
  zxingWasm: () => ipcRenderer.invoke('zxing:wasm'),

  // Scan tracking
  api: (payload, override) => ipcRenderer.invoke('api:call', payload, override),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),

  // Google sign-in
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    signIn: () => ipcRenderer.invoke('auth:signIn'),
    signInWithKey: (key) => ipcRenderer.invoke('auth:signInWithKey', key),
    cancel: () => ipcRenderer.invoke('auth:cancel'),
    signOut: () => ipcRenderer.invoke('auth:signOut'),
  },

  // Updates
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    version: () => ipcRenderer.invoke('update:version'),
    onAvailable: (fn) => ipcRenderer.on('update:available', (_e, d) => fn(d)),
    onProgress: (fn) => ipcRenderer.on('update:progress', (_e, d) => fn(d)),
  },

  // Logo library
  logos: {
    list: () => ipcRenderer.invoke('logos:list'),
    add: (dataUrl, name) => ipcRenderer.invoke('logos:add', { dataUrl, name }),
    remove: (id) => ipcRenderer.invoke('logos:remove', id),
  },
});
