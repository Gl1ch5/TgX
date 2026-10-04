'use strict';
// Only the bundled offline page gets the retry bridge; the live site sees nothing.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('telex', {
    retry: () => ipcRenderer.send('telex:retry'),
  });
}
