/**
 * 生产模式守护：后端，异常退出自动重启
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'supervisor.log');
const RESTART_MS = 3000;
const SERVER_DIR = path.join(ROOT, 'apps', 'server');
const SERVER_ENTRY = path.join(SERVER_DIR, 'dist', 'index.js');

let child = null;
let shuttingDown = false;

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch { /* ignore */ }
}

function startBackend() {
  if (shuttingDown) return;
  log('[supervisor] 启动后端（4725 + Excel桥接 + 祥钰）');
  child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  child.on('exit', (code) => {
    child = null;
    if (shuttingDown) return;
    log(`[supervisor] 后端退出 code=${code}，${RESTART_MS / 1000}秒后重启...`);
    setTimeout(startBackend, RESTART_MS);
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('[supervisor] 正在停止...');
  if (child) {
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('========================================');
log('和田玉手镯管理系统 — 服务守护进程');
log('本机: http://127.0.0.1:4725/inventory');
log('按 Ctrl+C 停止');
log('========================================');

startBackend();
