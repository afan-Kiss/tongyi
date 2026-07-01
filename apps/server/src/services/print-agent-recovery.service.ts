import { getPrintAgentUrl } from '../config/env'
import {
  findListeningPids,
  getPrintAgentPort,
  killPortListeners,
  sleepMs,
} from '../lib/kill-port'
import { startPrintAgentProcess, stopPrintAgentProcess, isProcessManagerShuttingDown } from './process-manager.service'

let lastPrintAgentOkAt = 0

export function isPrintAgentPortListening(): boolean {
  return findListeningPids(getPrintAgentPort()).length > 0
}

export async function pingPrintAgent(timeoutMs = 2500): Promise<boolean> {
  try {
    const res = await fetch(`${getPrintAgentUrl()}/health?quick=1`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return false
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean }
    if (data.ok === true) {
      lastPrintAgentOkAt = Date.now()
      return true
    }
    return false
  } catch {
    return false
  }
}

/** 设置页等只读展示：重试 + 端口监听，打印忙时不误判离线，且不触发重启 */
export async function getPrintAgentDisplayStatus(): Promise<{ online: boolean; message: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await pingPrintAgent(2500)) {
      return { online: true, message: '打印 Agent 在线' }
    }
    if (attempt < 2) await sleepMs(350)
  }

  if (isPrintAgentPortListening()) {
    return { online: true, message: '打印 Agent 在线' }
  }

  if (lastPrintAgentOkAt && Date.now() - lastPrintAgentOkAt < 90_000) {
    return { online: true, message: '打印 Agent 在线' }
  }

  return { online: false, message: '打印 Agent 离线' }
}

export async function waitForPrintAgentReady(maxWaitMs = 8000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < maxWaitMs) {
    if (await pingPrintAgent(2000)) return true
    await sleepMs(400)
  }
  return false
}

/** 停止子进程、清理端口占用、重新拉起 print-agent */
export async function recoverPrintAgent(reason: string): Promise<{ ok: boolean; message: string }> {
  if (isProcessManagerShuttingDown()) {
    return { ok: false, message: '系统正在关闭，已跳过打印 Agent 恢复' }
  }
  if (await pingPrintAgent(2500)) {
    return { ok: true, message: '打印 Agent 已在线' }
  }
  if (isPrintAgentPortListening()) {
    await sleepMs(800)
    if (await pingPrintAgent(5000)) {
      return { ok: true, message: '打印 Agent 已在线' }
    }
  }
  const port = getPrintAgentPort()
  console.warn(`[print-agent-recovery] 正在恢复打印 Agent（原因: ${reason}）…`)
  stopPrintAgentProcess()
  const killed = killPortListeners(port)
  if (killed.length) {
    console.warn(`[print-agent-recovery] 已结束占用 ${port} 端口的进程: ${killed.join(', ')}`)
  }
  await sleepMs(600)
  if (isProcessManagerShuttingDown()) {
    return { ok: false, message: '系统正在关闭，已跳过打印 Agent 恢复' }
  }
  startPrintAgentProcess()
  const ready = await waitForPrintAgentReady()
  const message = ready
    ? '打印 Agent 已自动重启'
    : `打印 Agent 重启后仍无响应（端口 ${port}），请手动运行 stop.bat 后再 start.bat`
  if (ready) console.log(`[print-agent-recovery] ${message}`)
  else console.error(`[print-agent-recovery] ${message}`)
  return { ok: ready, message }
}

export function classifyPrintFailure(raw: string): { code: string; solutions: string[] } {
  const msg = raw.toLowerCase()

  if (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('超时')
  ) {
    return {
      code: 'PRINT_TIMEOUT',
      solutions: [
        '确认璞趣桌面软件已打开，且打印机 PUQU 已连接、有纸、无报错灯',
        '在 Windows「设备和打印机」里取消卡住的打印任务',
        '若仍失败：关闭启动窗口后重新运行 start.bat（系统会自动清理 1216 端口）',
      ],
    }
  }

  if (
    msg.includes('agent 不可用') ||
    msg.includes('agent 离线') ||
    msg.includes('econnrefused') ||
    msg.includes('fetch failed') ||
    msg.includes('invalid response') ||
    msg.includes('无响应')
  ) {
    return {
      code: 'AGENT_OFFLINE',
      solutions: [
        '系统已尝试自动重启打印 Agent（1216 端口）',
        '打开设置页，看「打印 Agent」是否显示在线',
        '若仍离线：运行 stop.bat 再 start.bat，或检查 agents/print-agent 是否被安全软件拦截',
      ],
    }
  }

  if (msg.includes('未找到打印机') || (msg.includes('printer') && msg.includes('not found'))) {
    return {
      code: 'NO_PRINTER',
      solutions: [
        '在设置页填写 Windows「设备和打印机」里璞趣机的准确名称（如 PUQU）',
        '确认已安装璞趣驱动，USB 线已插好',
        '留空打印机名时系统会自动识别含 AQ00/璞趣 的设备',
      ],
    }
  }

  if (msg.includes('pqapi') || msg.includes('6780') || msg.includes('璞趣')) {
    return {
      code: 'PQAPI',
      solutions: [
        '打开璞趣标签桌面软件，保持运行（本地服务 127.0.0.1:6780）',
        '在璞趣软件里将标签纸设为 宽 25mm × 长 70mm',
        '重启璞趣软件后，在设置页点「吊牌测试打印」再试',
      ],
    }
  }

  if (msg.includes('缺少依赖') || msg.includes('pywin32') || msg.includes('pillow')) {
    return {
      code: 'AGENT_DEPS',
      solutions: [
        '在 agents/print-agent 目录执行：python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt',
        '完成后重启 start.bat',
      ],
    }
  }

  return {
    code: 'PRINT_UNKNOWN',
    solutions: [
      '到设置页查看「打印 Agent」是否在线，并试「吊牌测试打印」',
      '确认璞趣桌面 + PUQU 打印机正常',
      '仍不行：stop.bat → start.bat 完整重启',
    ],
  }
}

let watchTimer: ReturnType<typeof setInterval> | null = null
let recovering = false

export function stopPrintAgentWatch(): void {
  if (watchTimer) {
    clearInterval(watchTimer)
    watchTimer = null
  }
}

export function schedulePrintAgentWatch(): void {
  if (watchTimer || process.platform !== 'win32') return
  watchTimer = setInterval(() => {
    void (async () => {
      if (isProcessManagerShuttingDown()) return
      if (recovering) return
      if (await pingPrintAgent(2500)) return
      // 打印进行中 health 可能超时，但端口仍在监听 — 不要误杀进程
      if (isPrintAgentPortListening()) return
      recovering = true
      try {
        await recoverPrintAgent('periodic-health-check')
      } finally {
        recovering = false
      }
    })()
  }, 45_000)
  watchTimer.unref()
}

export { getPrintAgentPort, ensurePrintAgentPortFree } from '../lib/kill-port'
