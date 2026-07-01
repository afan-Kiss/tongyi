/**
 * 生产模式守护：后端，异常退出自动重启（端口不可用时不重启）
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { resolvePlan, applyEnv } = require('./port-precheck');

const ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(ROOT, 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'supervisor.log');
const RESTART_MS = 3000;
const SERVER_DIR = path.join(ROOT, 'apps', 'server');
const SERVER_ENTRY = path.join(SERVER_DIR, 'dist', 'index.js');

let child = null;
let shuttingDown = false;
let portPlan = null;

function log(msg) {
  const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`, 'utf8');
  } catch { /* ignore */ }
}

async function preparePortPlan() {
  portPlan = await resolvePlan();
  if (!portPlan) {
    log('[supervisor] 没有可用端口（1212 / 1312 / 1412 均不可用），已停止。');
    log('[supervisor] Windows 若 1212 被 Hyper-V 保留，会自动尝试 1312；也可设置 TONGYI_PORT_BASE。');
    process.exit(2);
  }
  applyEnv(portPlan);
  for (const w of portPlan.warnings || []) log(`[supervisor] ${w}`);
  if (portPlan.source === 'windows-fallback') {
    log(`[supervisor] 当前端口被 Windows 系统保留，已自动使用备用端口 ${portPlan.basePort}。`);
  }
  log(`[supervisor] 本机访问: http://127.0.0.1:${portPlan.ports.main}/inventory`);
  return portPlan;
}

function startBackend() {
  if (shuttingDown) return;
  const base = portPlan?.basePort || 1212;
  log(`[supervisor] 启动后端（${base} + Excel桥接 + 祥钰）`);
  child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  child.on('exit', (code) => {
    child = null;
    if (shuttingDown) return;
    if (code === 2) {
      log('[supervisor] 端口不可用，已停止（不会自动重启）');
      process.exit(2);
    }
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
log('统一经营台 — 服务守护进程');
log('按 Ctrl+C 停止');
log('========================================');

preparePortPlan()
  .then(() => startBackend())
  .catch((err) => {
    log(`[supervisor] 端口预检失败: ${err.message || err}`);
    process.exit(2);
  });
