import { loadEnv, getPort, getDataDir } from './config/env'
import { createApp } from './app'
import { prisma } from './lib/prisma'
import { ensureDefaultLabelTemplate } from './services/settings.service'
import { scheduleCertIndexWarmup } from './services/excel-cert-index.service'
import {
  startExcelBridgeProcess,
  stopExcelBridgeProcess,
  startPrintAgentProcess,
  stopPrintAgentProcess,
  startXiangyuProcesses,
  stopXiangyuProcesses,
} from './services/process-manager.service'

loadEnv()
getDataDir()

const port = getPort()

async function main() {
  await prisma.$connect()

  await ensureDefaultLabelTemplate()

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
  const excelEnabled = settings
    ? (() => { try { return JSON.parse(settings.json).excelBridgeEnabled !== false } catch { return true } })()
    : true
  process.env.EXCEL_BRIDGE_ENABLED = excelEnabled ? 'true' : 'false'

  if (excelEnabled) {
    startExcelBridgeProcess()
    scheduleCertIndexWarmup()
  }

  startPrintAgentProcess()

  startXiangyuProcesses()

  const { app, webMounted } = createApp()
  const server = app.listen(port, '0.0.0.0', () => {
    const mode = webMounted ? 'API + 前端静态' : '仅 API（开发模式或未构建前端）'
    console.log(`[backend] http://0.0.0.0:${port} (${mode})`)
    console.log('[backend] API: /api/v1/*')
  })

  const shutdown = () => {
    stopExcelBridgeProcess()
    stopPrintAgentProcess()
    stopXiangyuProcesses()
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('启动失败:', err)
  process.exit(1)
})
