const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { WorkerClient } = require('./services/worker-client.cjs');

const isDev = !app.isPackaged;
let devServer;
const projectRoot = path.join(__dirname, '..');
const worker = new WorkerClient(projectRoot);
const authorizedMedia = new Map();
let activeSourcePath = null;
let scanRunning = false;
let scanCanceled = false;

protocol.registerSchemesAsPrivileged([{
  scheme: 'demoshield-media',
  privileges: {
    standard: true,
    secure: true,
    corsEnabled: true,
    supportFetchAPI: true,
    stream: true,
  },
}]);

function startDevServer() {
  if (!isDev) return;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  devServer = spawn(npm, ['run', 'dev', '--', '--host', '127.0.0.1'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  devServer.on('error', (error) => console.error('Unable to start Vite:', error));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: '#111315',
    title: 'DemoShield',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setMenuBarVisibility(false);
  if (isDev) {
    const loadDevServer = async (attempt = 0) => {
      try {
        await window.loadURL('http://127.0.0.1:5173');
      } catch (error) {
        if (attempt < 30) setTimeout(() => loadDevServer(attempt + 1), 500);
        else console.error('DemoShield dev server was not reachable:', error);
      }
    };
    loadDevServer();
  } else window.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('video:open', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv'] }] });
  if (result.canceled) return null;
  const sourcePath = path.resolve(result.filePaths[0]);
  const extension = path.extname(sourcePath).toLowerCase();
  if (!['.mp4', '.mov', '.webm', '.mkv'].includes(extension)) throw new Error('Unsupported video format');
  const stats = await fs.stat(sourcePath);
  if (!stats.isFile() || stats.size === 0) throw new Error('The selected video is empty or invalid');
  const data = await worker.request('metadata', { source: sourcePath });
  activeSourcePath = sourcePath;
  const mediaId = crypto.randomUUID();
  authorizedMedia.set(mediaId, sourcePath);
  return { source: data.source, previewUrl: `demoshield-media://video/${mediaId}` };
});

ipcMain.handle('worker:ping', () => worker.request('ping'));

ipcMain.handle('scan:start', async (event, options = {}) => {
  if (!activeSourcePath) throw new Error('Import a source video before scanning');
  if (scanRunning) throw new Error('A privacy scan is already running');
  scanRunning = true;
  scanCanceled = false;
  try {
    const sampleIntervalSeconds = Number(options.sampleIntervalSeconds || 0.5);
    const heartbeatSeconds = Number(options.heartbeatSeconds || 2);
    const changeThreshold = Number(options.changeThreshold || 0.035);
    const ocrMaxWidth = Number(options.ocrMaxWidth || 1280);
    const ocrBatchSize = Number(options.ocrBatchSize || 4);
    const result = await worker.request(
      'scan',
      { source: activeSourcePath, sampleIntervalSeconds, heartbeatSeconds, changeThreshold, ocrMaxWidth, ocrBatchSize },
      {
        timeoutMs: 30 * 60 * 1000,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send('scan:progress', progress);
        },
      },
    );
    return { canceled: false, ...result };
  } catch (error) {
    if (scanCanceled) return { canceled: true, findings: [] };
    throw error;
  } finally {
    scanRunning = false;
  }
});

ipcMain.handle('scan:cancel', () => {
  if (!scanRunning) return false;
  scanCanceled = true;
  worker.stop();
  return true;
});

ipcMain.handle('project:save', async (_event, project) => {
  const result = await dialog.showSaveDialog({ defaultPath: `${project.name || 'untitled'}.demoshield`, filters: [{ name: 'DemoShield project', extensions: ['demoshield'] }] });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, JSON.stringify(project, null, 2), 'utf8');
  return result.filePath;
});

app.whenReady().then(() => {
  protocol.handle('demoshield-media', async (request) => {
    const mediaId = new URL(request.url).pathname.slice(1);
    const sourcePath = authorizedMedia.get(mediaId);
    if (!sourcePath) return new Response('Media not authorized', { status: 403 });
    const stats = await fs.stat(sourcePath);
    const range = request.headers.get('range');
    const mimeTypes = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska' };
    const contentType = mimeTypes[path.extname(sourcePath).toLowerCase()] || 'application/octet-stream';
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (!match) return new Response('Invalid range', { status: 416 });
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
      if (start > end || start >= stats.size) return new Response('Range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${stats.size}` } });
      const stream = fsSync.createReadStream(sourcePath, { start, end });
      return new Response(Readable.toWeb(stream), { status: 206, headers: { 'Accept-Ranges': 'bytes', 'Content-Type': contentType, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stats.size}` } });
    }
    const stream = fsSync.createReadStream(sourcePath);
    return new Response(Readable.toWeb(stream), { status: 200, headers: { 'Accept-Ranges': 'bytes', 'Content-Type': contentType, 'Content-Length': String(stats.size) } });
  });
  startDevServer();
  setTimeout(createWindow, isDev ? 1200 : 0);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('will-quit', () => { if (devServer) devServer.kill(); worker.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
