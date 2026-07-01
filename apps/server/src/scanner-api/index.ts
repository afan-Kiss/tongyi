import type { Server } from 'node:http'

import { getScannerApiPort, isScannerApiEnabled } from '../config/env'
import { createScannerApiApp } from './scanner-api-app'

let server: Server | null = null

/** 启动本地 Scanner API（仅 127.0.0.1，供 Worker / 记账系统调用） */
export function startScannerApiServer(): Server | null {
  if (!isScannerApiEnabled()) {
    console.log('[scanner-api] 已禁用（SCANNER_API_ENABLED=false）')
    return null
  }
  if (server) return server

  const port = getScannerApiPort()
  const app = createScannerApiApp()
  server = app.listen(port, '127.0.0.1', () => {
    console.log(`[scanner-api] http://127.0.0.1:${port} （仅本机）`)
    console.log('[scanner-api] GET /api/health /api/bracelets/:code /api/bracelets/search /api/files/image')
  })
  server.on('error', (err) => {
    console.error('[scanner-api] 启动失败:', err instanceof Error ? err.message : err)
  })
  return server
}

export function stopScannerApiServer(): void {
  if (!server) return
  server.close()
  server = null
}

export { getBraceletByCode, searchBracelets } from './scanner-bracelet.service'
