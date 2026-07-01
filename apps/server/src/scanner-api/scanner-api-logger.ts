import fs from 'node:fs'
import path from 'node:path'

import { getDataDir } from '../config/env'

const LOG_DIR = path.join(getDataDir(), 'logs')
const LOG_FILE = path.join(LOG_DIR, 'scanner-api.log')

function ensureLogDir(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

export function logScannerApi(event: {
  action: string
  code?: string
  query?: string
  found?: boolean
  error?: string
  [key: string]: unknown
}): void {
  try {
    ensureLogDir()
    const line = JSON.stringify({
      time: new Date().toISOString(),
      ...event,
    })
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8')
  } catch (err) {
    console.warn('[scanner-api] 写日志失败:', err instanceof Error ? err.message : err)
  }
}
