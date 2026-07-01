import { loadEnv, getPort, getDataDir, getMobileHttpsPort } from './config/env'
import { createApp } from './app'
import { prisma } from './lib/prisma'
import { ensureAuthUsersFile } from './services/auth.service'
import { checkStartupLicense, scheduleLicenseRefresh } from './services/youdaoLicense.service'
import { startMobileHttpsServer } from './lib/mobile-https'
import { startScannerApiServer, stopScannerApiServer } from './scanner-api'
import { ensureDefaultLabelTemplate } from './services/settings.service'
import { scheduleCertIndexWarmup } from './services/excel-cert-index.service'
import { schedulePendingExcelSyncRetry, stopPendingExcelSyncRetry } from './services/operation.service'
import {
  startExcelBridgeProcess,
  stopExcelBridgeProcess,
  startPrintAgentProcess,
  stopPrintAgentProcess,
  startXiangyuProcesses,
  stopXiangyuProcesses,
  markProcessManagerShuttingDown,
} from './services/process-manager.service'
import { schedulePrintAgentWatch, stopPrintAgentWatch } from './services/print-agent-recovery.service'
import { appendBackendLog, registerProcessCrashHandlers } from './lib/crash-log'

loadEnv()
getDataDir()
registerProcessCrashHandlers()
appendBackendLog('startup', 'backend 启动')

const port = getPort()

let shuttingDown = false

async function main() {
  await prisma.$connect()

  ensureAuthUsersFile()

  await checkStartupLicense({ timeoutMs: 1500 })
  scheduleLicenseRefresh()

  await ensureDefaultLabelTemplate()
  const { loadPlatformPathsCache } = await import('./modules/system-discovery/systemDiscovery.service')
  await loadPlatformPathsCache()

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
  const excelEnabled = settings
    ? (() => { try { return JSON.parse(settings.json).excelBridgeEnabled !== false } catch { return true } })()
    : true
  process.env.EXCEL_BRIDGE_ENABLED = excelEnabled ? 'true' : 'false'

  if (excelEnabled) {
    startExcelBridgeProcess()
    scheduleCertIndexWarmup()
    schedulePendingExcelSyncRetry()
  }

  startPrintAgentProcess()
  schedulePrintAgentWatch()

  startXiangyuProcesses()

  const { app, webMounted } = createApp()
  const server = app.listen(port, '0.0.0.0', () => {
    const mode = webMounted ? 'API + 前端静态' : '仅 API（开发模式或未构建前端）'
    console.log(`[backend] http://0.0.0.0:${port} (${mode})`)
    console.log('[backend] API: /api/v1/*')
    const httpsPort = getMobileHttpsPort()
    if (httpsPort) {
      console.log(`[backend] 手机拍照 HTTPS 端口: ${httpsPort}`)
    }
  })

  const httpsServer = startMobileHttpsServer(app)
  startScannerApiServer()

  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    markProcessManagerShuttingDown()

    const forceTimer = setTimeout(() => {
      console.warn('[backend] shutdown 超时，强制退出')
      process.exit(1)
    }, 9000)
    forceTimer.unref()

    const finish = async () => {
      try {
        await prisma.$disconnect()
      } catch (err) {
        console.warn('[backend] prisma disconnect 失败:', err instanceof Error ? err.message : err)
      }
      clearTimeout(forceTimer)
      process.exit(0)
    }

    try { stopExcelBridgeProcess() } catch (err) {
      console.warn('[backend] stop Excel Bridge 失败:', err instanceof Error ? err.message : err)
    }
    try { stopPrintAgentProcess() } catch (err) {
      console.warn('[backend] stop Print Agent 失败:', err instanceof Error ? err.message : err)
    }
    try { stopXiangyuProcesses() } catch (err) {
      console.warn('[backend] stop 祥钰进程失败:', err instanceof Error ? err.message : err)
    }
    try { stopPrintAgentWatch() } catch (err) {
      console.warn('[backend] stop Print Agent watch 失败:', err instanceof Error ? err.message : err)
    }
    try { stopPendingExcelSyncRetry() } catch (err) {
      console.warn('[backend] stop Excel retry 失败:', err instanceof Error ? err.message : err)
    }
    try { stopScannerApiServer() } catch (err) {
      console.warn('[backend] stop Scanner API 失败:', err instanceof Error ? err.message : err)
    }

    const closeHttp = () => {
      try {
        server.close(() => { void finish() })
      } catch (err) {
        console.warn('[backend] HTTP server close 失败:', err instanceof Error ? err.message : err)
        void finish()
      }
    }

    if (httpsServer) {
      try {
        httpsServer.close(() => closeHttp())
      } catch (err) {
        console.warn('[backend] HTTPS server close 失败:', err instanceof Error ? err.message : err)
        closeHttp()
      }
    } else {
      closeHttp()
    }
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  appendBackendLog('startup-failed', err instanceof Error ? err.message : String(err), {
    stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
  })
  console.error('启动失败:', err)
  process.exit(1)
})
