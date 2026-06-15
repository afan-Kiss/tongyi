/**
 * 单终端启动：Web(3080) + Bridge(9323) + frpc(可选)
 * 子进程异常退出后自动重启
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { loadConfig } = require('../config');
const RESTART_MS = 3000;
const PORT_BUSY_RESTART_MS = 15000;
const FRPC_START_DELAY_MS = 2000;

const children = new Map();
const portBusyLogged = new Set();
const frpcState = { starting: false, warnedDuplicate: false };

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

function looksLikeFrpcDuplicateOutput(text) {
  return /proxy\s+\[xiangyu-web\]\s+already exists/i.test(String(text || ''));
}

function killExistingFrpc() {
  if (process.platform !== 'win32') return;
  try {
    execSync('taskkill /F /IM frpc.exe', { stdio: 'ignore' });
    log('supervisor', '已清理旧的 frpc 进程');
  } catch {
    // no frpc running
  }
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
      .forEach((line) => {
        if (tag === 'frpc' && /already exists/i.test(line)) {
          if (!frpcState.warnedDuplicate) {
            frpcState.warnedDuplicate = true;
            log('frpc', '检测到重复隧道，正在清理后重连…');
            try {
              child.kill('SIGTERM');
            } catch {
              // ignore
            }
            killExistingFrpc();
            setTimeout(() => {
              if (!shuttingDown && !children.has('frpc')) startService(frpcDef);
            }, FRPC_START_DELAY_MS);
          }
          return;
        }
        log(tag, line);
      });
  });
}

function spawnService(def) {
  if (def.tag === 'frpc') {
    if (frpcState.starting || children.has('frpc')) return null;
    frpcState.starting = true;
    frpcState.warnedDuplicate = false;
    killExistingFrpc();
  }

  const spawnEnv = { ...process.env, ...(def.env || {}) };
  if (def.tag === 'bridge') {
    // #region agent log
    fetch('http://127.0.0.1:7423/ingest/00b07a67-c9d2-4479-805d-94cb0e719154', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '124bda' },
      body: JSON.stringify({
        sessionId: '124bda',
        location: 'supervisor.js:spawnService',
        message: 'bridge spawn env (before config merge)',
        data: {
          envDevtoolsPort: spawnEnv.DEVTOOLS_PORT || null,
          envQianfanDir: Boolean(spawnEnv.QIANFAN_DATA_DIR),
          configDevtoolsPort: (() => {
            try {
              return loadConfig().bridge?.devtoolsPort;
            } catch {
              return null;
            }
          })(),
        },
        hypothesisId: 'H3',
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

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
    if (def.tag === 'frpc') frpcState.starting = false;
    log(def.tag, `启动失败: ${err.message}`);
    if (def.tag === 'frpc') {
      log(def.tag, '内网穿透已跳过，Web 与 Bridge 继续运行');
      return null;
    }
    setTimeout(() => {
      if (!shuttingDown) startService(def);
    }, RESTART_MS);
    return null;
  }

  child.on('error', (err) => {
    children.delete(def.tag);
    if (def.tag === 'frpc') frpcState.starting = false;
    if (shuttingDown) return;
    log(def.tag, `进程异常: ${err.message}`);
    if (def.tag === 'frpc') {
      log(def.tag, '内网穿透已跳过，Web 与 Bridge 继续运行');
      return;
    }
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
    if (def.tag === 'frpc') frpcState.starting = false;
    if (shuttingDown) return;

    if (def.tag === 'frpc' && looksLikeFrpcDuplicateOutput(recentOutput)) {
      killExistingFrpc();
      setTimeout(() => {
        if (!shuttingDown) startService(def);
      }, FRPC_START_DELAY_MS);
      return;
    }

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
  if (def.tag === 'frpc') frpcState.starting = false;
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

const frpcExe = path.join(ROOT, 'deploy', 'frpc', 'frpc.exe');
const frpcCfg = path.join(ROOT, 'deploy', 'frpc.toml');

const frpcDef = {
  tag: 'frpc',
  command: frpcExe,
  args: ['-c', frpcCfg],
  cwd: path.join(ROOT, 'deploy'),
  optional: true,
  check: () => {
    if (!fs.existsSync(frpcExe) || !fs.existsSync(frpcCfg)) return false;
    try {
      const stat = fs.statSync(frpcExe);
      return stat.isFile() && stat.size > 0;
    } catch {
      return false;
    }
  },
  skipMessage: '未找到 deploy/frpc/frpc.exe 或 frpc.toml，跳过内网穿透',
};

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
  frpcDef,
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
  killExistingFrpc();
  setTimeout(() => process.exit(0), 800);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log('supervisor', '祥钰系统启动中…');
log('supervisor', `Web → http://localhost:4726  |  Bridge → http://127.0.0.1:4727`);
log('supervisor', '按 Ctrl+C 停止全部服务\n');

killExistingFrpc();

for (const def of services) {
  if (def.tag === 'frpc') {
    setTimeout(() => startService(def), FRPC_START_DELAY_MS);
  } else {
    startService(def);
  }
}
