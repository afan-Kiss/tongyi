/**
 * 本地助手最小实现（HTTP 轮询版）
 * 用法：node scripts/local-agent.js --server http://127.0.0.1:1212
 */
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const args = process.argv.slice(2)
function arg(name, fallback = '') {
  const idx = args.indexOf(name)
  return idx >= 0 ? String(args[idx + 1] || fallback) : fallback
}

const SERVER = (arg('--server', process.env.AGENT_SERVER_URL || 'http://127.0.0.1:1212')).replace(/\/$/, '')
const MACHINE_CODE = arg('--machine', process.env.AGENT_MACHINE_CODE || os.hostname())
const MACHINE_NAME = arg('--name', process.env.AGENT_MACHINE_NAME || `${os.hostname()} 本地助手`)
const POLL_MS = Number(arg('--poll', process.env.AGENT_POLL_MS || '3000')) || 3000
const QIANFAN_ROOT = path.resolve(
  arg('--qianfan-root', process.env.QIANFAN_RELAY_ROOT || path.join(__dirname, '../../千帆中转机器人')),
)

let token = process.env.AGENT_TOKEN || ''
let qianfanChild = null

async function api(pathname, init = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  }
  if (token) headers['x-agent-token'] = token
  const res = await fetch(`${SERVER}/api/v1${pathname}`, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `HTTP ${res.status}`)
  }
  return data
}

async function register() {
  const data = await api('/agent/register', {
    method: 'POST',
    body: JSON.stringify({
      machineCode: MACHINE_CODE,
      name: MACHINE_NAME,
      version: 'local-agent-stub-1.0',
      capabilities: ['excel', 'print', 'qianfan', 'file-upload'],
    }),
  })
  token = data.data.token
  console.log('[local-agent] 注册成功', data.data.machine.machineCode)
}

async function heartbeat() {
  await api('/agent/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      machineCode: MACHINE_CODE,
      status: 'online',
      version: 'local-agent-stub-1.0',
      capabilities: ['excel', 'print', 'qianfan', 'file-upload'],
      detail: {
        qianfanRootExists: fs.existsSync(QIANFAN_ROOT),
        qianfanChildPid: qianfanChild?.pid || null,
      },
    }),
  })
}

function spawnQianfan() {
  if (!fs.existsSync(QIANFAN_ROOT)) {
    throw new Error(`千帆路径不存在：${QIANFAN_ROOT}`)
  }
  if (qianfanChild && !qianfanChild.killed) {
    return { ok: true, message: '千帆进程已在运行', pid: qianfanChild.pid }
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  qianfanChild = spawn(npmCmd, ['start'], {
    cwd: QIANFAN_ROOT,
    stdio: 'ignore',
    detached: true,
    shell: true,
  })
  qianfanChild.unref()
  return { ok: true, message: '已启动千帆机器人', pid: qianfanChild.pid }
}

function stopQianfan() {
  if (qianfanChild && !qianfanChild.killed) {
    try {
      process.kill(qianfanChild.pid)
    } catch {
      // ignore
    }
    qianfanChild = null
  }
  return { ok: true, message: '已发送停止信号（如为 Electron 请在本机托盘确认）' }
}

async function executeTask(task) {
  const type = task.type
  const payload = task.payload || {}
  switch (type) {
    case 'qianfan.start':
      return { status: 'success', result: spawnQianfan() }
    case 'qianfan.stop':
      return { status: 'success', result: stopQianfan() }
    case 'qianfan.restart':
      stopQianfan()
      return { status: 'success', result: spawnQianfan() }
    case 'qianfan.status':
      return {
        status: 'success',
        result: {
          qianfanRoot: QIANFAN_ROOT,
          exists: fs.existsSync(QIANFAN_ROOT),
          pid: qianfanChild?.pid || null,
        },
      }
    case 'qianfan.sendText':
      if (!payload.buyerNick) {
        return { status: 'failed', errorMessage: '必须指定 buyerNick' }
      }
      return { status: 'retryable_failed', errorMessage: '发送文字需对接千帆本地 API，第二阶段实现' }
    case 'qianfan.sendImage':
      return { status: 'retryable_failed', errorMessage: '发送图片需对接千帆本地 API，第二阶段实现' }
    case 'excel.read':
    case 'excel.write':
    case 'excel.export':
      return { status: 'retryable_failed', errorMessage: 'Excel 任务将在本地助手 EXE 第二阶段接入' }
    default:
      return { status: 'failed', errorMessage: `未实现的任务类型：${type}` }
  }
}

async function pollLoop() {
  try {
    const pulled = await api('/agent/tasks/pull')
    const task = pulled.data.task
    if (!task) return
    console.log('[local-agent] 执行任务', task.type, task.id)
    const result = await executeTask(task)
    await api(`/agent/tasks/${encodeURIComponent(task.id)}/result`, {
      method: 'POST',
      body: JSON.stringify(result),
    })
    console.log('[local-agent] 任务完成', task.id, result.status)
  } catch (err) {
    console.warn('[local-agent] 轮询异常', err.message || err)
  }
}

async function main() {
  console.log('[local-agent] 连接服务器', SERVER)
  await register()
  await heartbeat()
  setInterval(() => { void heartbeat().catch(() => {}) }, POLL_MS)
  setInterval(() => { void pollLoop() }, POLL_MS)
  await pollLoop()
}

main().catch((err) => {
  console.error('[local-agent] 启动失败', err)
  process.exit(1)
})
