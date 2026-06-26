import { execSync } from 'node:child_process'

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

/** Windows：结束占用端口的进程（可排除当前进程） */
export function killPortListeners(port: number, excludePid = process.pid): number[] {
  if (process.platform !== 'win32') return []
  const killed: number[] = []
  for (const pid of findListeningPids(port)) {
    if (pid === excludePid) continue
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
      killed.push(pid)
    } catch {
      /* ignore */
    }
  }
  return killed
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

import { getPrintAgentPort as envPrintAgentPort } from '../config/env'

export function getPrintAgentPort(): number {
  return envPrintAgentPort()
}

/** 启动前：若 print-agent 端口被僵尸进程占用则清理 */
export function ensurePrintAgentPortFree(): void {
  if (process.platform !== 'win32') return
  const port = getPrintAgentPort()
  const pids = findListeningPids(port)
  if (!pids.length) return
  console.warn(`[process-manager] 端口 ${port} 已被占用 (PID ${pids.join(', ')})，正在清理…`)
  killPortListeners(port)
}
