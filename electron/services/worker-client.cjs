const { spawn } = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');
const fs = require('node:fs');

class WorkerClient {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.process = null;
    this.pending = new Map();
    this.ready = null;
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const runner = path.join(this.projectRoot, 'services', 'video-worker', 'run_worker.py');
      const localPython = process.platform === 'win32'
        ? path.join(path.dirname(runner), '.venv', 'Scripts', 'python.exe')
        : path.join(path.dirname(runner), '.venv', 'bin', 'python');
      const configured = process.env.DEMOSHIELD_PYTHON;
      const hasLocalPython = fs.existsSync(localPython);
      const command = configured || (hasLocalPython ? localPython : (process.platform === 'win32' ? 'py' : 'python3'));
      const args = configured || hasLocalPython ? [runner] : process.platform === 'win32' ? ['-3', runner] : [runner];
      const child = spawn(command, args, {
        cwd: path.dirname(runner),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.process = child;
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', (line) => this.onMessage(line));
      child.stderr.on('data', (chunk) => console.error(`[video-worker] ${chunk.toString().trim()}`));
      child.once('error', (error) => {
        this.ready = null;
        reject(new Error(`Unable to start Python worker: ${error.message}`));
      });
      child.once('spawn', resolve);
      child.once('exit', (code) => {
        this.process = null;
        this.ready = null;
        for (const { reject: rejectPending, timer } of this.pending.values()) {
          clearTimeout(timer);
          rejectPending(new Error(`Python worker stopped with exit code ${code}`));
        }
        this.pending.clear();
      });
    });
    return this.ready;
  }

  onMessage(line) {
    let response;
    try { response = JSON.parse(line); }
    catch { return console.error('[video-worker] Invalid JSON response'); }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    if (response.event === 'progress') {
      if (pending.onProgress) pending.onProgress(response.data);
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.data);
    else pending.reject(new Error(response.error || 'Video worker request failed'));
  }

  async request(command, payload = {}, options = {}) {
    await this.start();
    const id = crypto.randomUUID();
    const timeoutMs = options.timeoutMs || 30000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Video worker timed out while running ${command}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, onProgress: options.onProgress });
      this.process.stdin.write(`${JSON.stringify({ id, command, ...payload })}\n`);
    });
  }

  stop() {
    if (this.process) this.process.kill();
  }
}

module.exports = { WorkerClient };
