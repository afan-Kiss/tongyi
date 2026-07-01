/**
 * 单终端启动：Web(4726) + Bridge(4727)
 * 子进程异常退出后自动重启
 */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESTART_MS = 3000;
const PORT_BUSY_RESTART_MS = 15000;

const children = new Map();
const portBusyLogged = new Set();

function log(tag, msg) {
  const line = `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}][${tag}] ${msg}`;
  process.stdout.write(`${line}\n`);
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '0.0.0.0');
  });
}

function looksLikePortBusyOutput(text) {
  return /EADDRINUSE|address already in use/i.test(String(text || ''));
}

function pipeOutput(tag, child, onChunk) {
  child.stdout?.on('data', (buf) => {
    const text = String(buf);
    onChunk?.(text);
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => log(tag, line));
  });
  child.stderr?.on('data', (buf) => {
    const text = String(buf);
    onChunk?.(text);
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => log(tag, line));
  });
}

function spawnService(def) {
  const spawnEnv = { ...process.env, ...(def.env || {}) };

  let child;
  try {
    child = spawn(def.command, def.args, {
      cwd: def.cwd || ROOT,
      env: spawnEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: def.shell ?? false,
      windowsHide: true,
    });
  } catch (err) {
    log(def.tag, `启动失败: ${err.message}`);
    setTimeout(() => {
      if (!shuttingDown) startService(def);
    }, RESTART_MS);
    return null;
  }

  child.on('error', (err) => {
    children.delete(def.tag);
    if (shuttingDown) return;
    log(def.tag, `进程异常: ${err.message}`);
    setTimeout(() => {
      if (!shuttingDown) startService(def);
    }, RESTART_MS);
  });

  let recentOutput = '';

  pipeOutput(def.tag, child, (chunk) => {
    recentOutput = `${recentOutput}${chunk}`.slice(-2000);
  });

  child.on('exit', (code, signal) => {
    children.delete(def.tag);
    if (shuttingDown) return;

    const portBusy = def.port && looksLikePortBusyOutput(recentOutput);
    const delay = portBusy ? PORT_BUSY_RESTART_MS : RESTART_MS;
    if (portBusy) {
      log(def.tag, `端口 ${def.port} 被占用，${delay / 1000}s 后重试…（请只开一个 start.bat）`);
    } else {
      log(def.tag, `进程退出 code=${code ?? 'null'} signal=${signal || ''}，${delay / 1000}s 后重启…`);
    }
    setTimeout(() => {
      if (!shuttingDown) startService(def);
    }, delay);
  });

  children.set(def.tag, child);
  log(def.tag, '已启动');
  return child;
}

function startService(def) {
  if (def.optional && def.check && !def.check()) {
    log(def.tag, def.skipMessage || '已跳过（未配置）');
    return null;
  }

  if (def.port) {
    isPortInUse(def.port).then((busy) => {
      if (busy && !shuttingDown) {
        if (!portBusyLogged.has(def.tag)) {
          portBusyLogged.add(def.tag);
          log(
            def.tag,
            `端口 ${def.port} 已被占用。请关闭其他「npm start」或多余的 start.bat 窗口，只保留一个。`,
          );
        }
        setTimeout(() => {
          if (!shuttingDown && !children.has(def.tag)) startService(def);
        }, PORT_BUSY_RESTART_MS);
        return;
      }
      portBusyLogged.delete(def.tag);
      spawnService(def);
    });
    return null;
  }

  return spawnService(def);
}

const services = [
  {
    tag: 'web',
    command: process.execPath,
    args: ['server/index.js'],
    port: 4726,
  },
  {
    tag: 'bridge',
    command: process.execPath,
    args: ['scripts/bridge-relay.js'],
    port: 4727,
  },
];

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('supervisor', '正在停止所有服务…');
  for (const child of children.values()) {
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(0), 800);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('supervisor', '祥钰系统启动中…');
log('supervisor', `Web → http://localhost:4726  |  Bridge → http://127.0.0.1:4727`);
log('supervisor', '按 Ctrl+C 停止全部服务\n');

for (const def of services) {
  startService(def);
}
