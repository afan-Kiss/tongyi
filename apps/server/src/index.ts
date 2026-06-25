import { loadEnv, getPort, getDataDir, getMobileHttpsPort } from './config/env'
import { createApp } from './app'
import { prisma } from './lib/prisma'
import { ensureAuthUsersFile } from './services/auth.service'
import { checkStartupLicense, scheduleLicenseRefresh } from './services/youdaoLicense.service'
import { startMobileHttpsServer } from './lib/mobile-https'
import { ensureDefaultLabelTemplate } from './services/settings.service'
import { scheduleCertIndexWarmup } from './services/excel-cert-index.service'
import { schedulePendingExcelSyncRetry } from './services/operation.service'
import {
  startExcelBridgeProcess,
  stopExcelBridgeProcess,
  startPrintAgentProcess,
  stopPrintAgentProcess,
  startXiangyuProcesses,
  stopXiangyuProcesses,
} from './services/process-manager.service'
import { schedulePrintAgentWatch } from './services/print-agent-recovery.service'
import { appendBackendLog, registerProcessCrashHandlers } from './lib/crash-log'

loadEnv()
getDataDir()
registerProcessCrashHandlers()
appendBackendLog('startup', 'backend 启动')

const port = getPort()

async function main() {
  await prisma.$connect()

  ensureAuthUsersFile()

  await checkStartupLicense({ timeoutMs: 1500 })
  scheduleLicenseRefresh()

  await ensureDefaultLabelTemplate()

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

  const shutdown = () => {
    stopExcelBridgeProcess()
    stopPrintAgentProcess()
    stopXiangyuProcesses()
    httpsServer?.close()
    server.close(() => process.exit(0))
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
