/**
 * 一键重启：释放端口 → 构建 → 启动 supervisor
 * 供改完代码后自动拉起服务使用
 */
const { spawn, execSync } = require('node:child_process')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const PORTS = [1212, 1213, 1214, 1215, 1216, 1217, 1218]

function killPort(port) {
  if (process.platform !== 'win32') return
  try {
    const out = execSync(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pids = new Set()
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/(\d+)\s*$/)
      if (m) pids.add(m[1])
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
        console.log(`[restart] 已结束端口 ${port} 的进程 PID ${pid}`)
      } catch { /* ignore */ }
    }
  } catch { /* no listener */ }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

console.log('[restart] 释放服务端口...')
for (const port of PORTS) killPort(port)
sleep(1500)

console.log('[restart] 构建中...')
execSync('npm run build', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
})

console.log('[restart] 启动 supervisor...')
const child = spawn(process.execPath, [path.join(__dirname, 'supervisor.js')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
})
