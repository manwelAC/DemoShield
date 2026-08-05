const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('demoShield', {
  openVideo: () => ipcRenderer.invoke('video:open'),
  pingWorker: () => ipcRenderer.invoke('worker:ping'),
  saveProject: (project) => ipcRenderer.invoke('project:save', project),
});
