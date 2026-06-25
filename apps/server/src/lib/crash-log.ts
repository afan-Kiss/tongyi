import fs from 'node:fs'
import path from 'node:path'
import { getDataDir } from '../config/env'

function logDir(): string {
  const dir = path.join(getDataDir(), 'logs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function logFile(): string {
  const d = new Date()
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return path.join(logDir(), `backend-${day}.log`)
}

export function appendBackendLog(tag: string, message: string, extra?: Record<string, unknown>): void {
  const ts = new Date().toISOString()
  const mem = process.memoryUsage()
  const line = JSON.stringify({
    ts,
    tag,
    message,
    pid: process.pid,
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    ...extra,
  })
  try {
    fs.appendFileSync(logFile(), `${line}\n`, 'utf8')
  } catch {
    console.error(`[crash-log] ${tag}: ${message}`)
  }
}

export function registerProcessCrashHandlers(): void {
  process.on('uncaughtException', (err) => {
    appendBackendLog('uncaughtException', err.message, {
      stack: err.stack?.slice(0, 2000),
    })
    console.error('[backend] 未捕获异常，进程即将退出:', err)
    setTimeout(() => process.exit(1), 500)
  })

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason)
    appendBackendLog('unhandledRejection', msg, {
      stack: reason instanceof Error ? reason.stack?.slice(0, 2000) : undefined,
    })
    console.error('[backend] 未处理的 Promise 拒绝:', reason)
  })

  process.on('SIGTERM', () => appendBackendLog('signal', 'SIGTERM'))
  process.on('SIGINT', () => appendBackendLog('signal', 'SIGINT'))

  setInterval(() => {
    const mem = process.memoryUsage()
    if (mem.rss > 1.8 * 1024 * 1024 * 1024) {
      appendBackendLog('memory-high', 'RSS 超过 1.8GB', {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      })
    }
  }, 10 * 60 * 1000).unref()
}
