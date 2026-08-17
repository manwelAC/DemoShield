const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('demoShield', {
  openVideo: () => ipcRenderer.invoke('video:open'),
  pingWorker: () => ipcRenderer.invoke('worker:ping'),
  startScan: (options) => ipcRenderer.invoke('scan:start', options),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  onScanProgress: (listener) => {
    const handler = (_event, progress) => listener(progress);
    ipcRenderer.on('scan:progress', handler);
    return () => ipcRenderer.removeListener('scan:progress', handler);
  },
  saveProject: (project) => ipcRenderer.invoke('project:save', project),
});
