import { execSync } from 'node:child_process'
import { getPrintAgentPort as envPrintAgentPort } from '../config/env'

/** Windows：查找监听指定端口的 PID 列表 */
export function findListeningPids(port: number): number[] {
  if (process.platform !== 'win32') return []
  try {
    const out = execSync(`netstat -ano | findstr ":${port} " | findstr "LISTENING"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pids = new Set<number>()
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/(\d+)\s*$/)
      if (m) pids.add(Number(m[1]))
    }
    return [...pids].filter((pid) => pid > 0)
  } catch {
    return []
  }
}

/** Windows：结束占用端口的进程（可排除指定 PID） */
export function killPortListeners(port: number, excludePids: number | number[] = process.pid): number[] {
  if (process.platform !== 'win32') return []
  const exclude = new Set(Array.isArray(excludePids) ? excludePids : [excludePids])
  const killed: number[] = []
  for (const pid of findListeningPids(port)) {
    if (exclude.has(pid)) continue
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
      killed.push(pid)
    } catch {
      /* ignore */
    }
  }
  return killed
}

/** 同步探测 print-agent /health?quick=1（启动前避免误杀健康进程） */
export function pingPrintAgentHealthSync(port?: number, timeoutMs = 2500): boolean {
  const targetPort = port ?? getPrintAgentPort()
  try {
    execSync(
      `node -e "fetch('http://127.0.0.1:${targetPort}/health?quick=1',{signal:AbortSignal.timeout(${timeoutMs})}).then(r=>r.json()).then(d=>process.exit(d.ok?0:1)).catch(()=>process.exit(1))"`,
      { stdio: 'ignore', timeout: timeoutMs + 2000, windowsHide: true },
    )
    return true
  } catch {
    return false
  }
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getPrintAgentPort(): number {
  return envPrintAgentPort()
}

/** 启动前：仅清理无响应的僵尸进程，勿误杀健康的 print-agent */
export function ensurePrintAgentPortFree(excludePids: number[] = []): void {
  if (process.platform !== 'win32') return
  const port = getPrintAgentPort()
  const pids = findListeningPids(port)
  if (!pids.length) return
  if (pingPrintAgentHealthSync(port)) {
    console.log(
      `[process-manager] 端口 ${port} 已有健康的打印 Agent (PID ${pids.join(', ')})，跳过清理`,
    )
    return
  }
  const exclude = [process.pid, ...excludePids]
  const toKill = pids.filter((pid) => !exclude.includes(pid))
  if (!toKill.length) return
  console.warn(`[process-manager] 端口 ${port} 被无响应进程占用 (PID ${toKill.join(', ')})，正在清理…`)
  killPortListeners(port, exclude)
}
