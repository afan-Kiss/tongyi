import { Router } from 'express'
import { operationsRouter } from './operations.routes'
import { inventoryRouter } from './inventory.routes'
import { mediaV1Router } from './media.routes'
import { excelV1Router } from './excel.routes'
import { settingsV1Router } from './settings.routes'
import { detailRouter } from './detail.routes'
import { photoRelayRouter } from './photo-relay.routes'
import { auditIngestRouter, auditRouter } from './audit.routes'
import { getMobileCameraNetworkInfo } from '../../lib/mobile-camera-url'
import { auditApiLogMiddleware } from '../../middleware/auditApiLog'
import { sendErr } from '../../utils/api-response'
import { agentRouter } from '../../modules/agent/agent.routes'
import { qianfanRelayRouter } from '../../modules/qianfan-relay/qianfanRelay.routes'
import { portalRouter } from '../../modules/portal/portal.routes'

export const v1Router = Router()

v1Router.use(auditApiLogMiddleware)

v1Router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'jade-inventory-api',
    version: 'v1',
    mobile: getMobileCameraNetworkInfo(),
  })
})

v1Router.use('/operations', operationsRouter)
v1Router.use('/inventory', inventoryRouter)
v1Router.use('/media', mediaV1Router)
v1Router.use('/excel', excelV1Router)
v1Router.use('/settings', settingsV1Router)

v1Router.use('/detail', detailRouter)
v1Router.use('/photo-relay', photoRelayRouter)
v1Router.use('/audit', auditIngestRouter)
v1Router.use('/audit', auditRouter)

v1Router.use('/agent', agentRouter)
v1Router.use('/qianfan-relay', qianfanRelayRouter)
v1Router.use('/portal', portalRouter)

v1Router.post('/print/bracelet-tag', async (req, res) => {
  const { queryByCertNo } = await import('../../services/inventory-query.service')
  const { getSettings } = await import('../../services/settings.service')
  const { braceletRepo } = await import('../../repositories/bracelet.repository')
  const { printBraceletTagWithRecovery } = await import('../../services/print-bracelet.service')
  try {
    let bracelet = req.body?.bracelet
    if (!bracelet?.certNo && req.body?.certNo) {
      bracelet = await queryByCertNo(String(req.body.certNo))
    }
    if (!bracelet?.certNo) {
      return sendErr(res, '缺少 bracelet 或 certNo', 400)
    }
    const settings = await getSettings()
    const result = await printBraceletTagWithRecovery({
      bracelet,
      template: req.body?.template,
      printerName: req.body?.printerName || settings.printerName || undefined,
      side: req.body?.side || 'both',
    })
    if (!result.ok) {
      return sendErr(res, result.message, 502, result.code, result.solutions)
    }
    const lines = req.body?.template?.lines as { kind?: string; format?: string }[] | undefined
    const barcodeLine = lines?.find((l) => l.kind === 'barcode')
    const barcodeValue =
      String(barcodeLine?.format || '').trim() ||
      String((req.body?.bracelet as { barcodeValue?: string } | undefined)?.barcodeValue || '').trim()
    if (barcodeValue) {
      const row = await braceletRepo.findByCert(String(bracelet.certNo))
      if (row) {
        await braceletRepo.update(row.id, { barcodeValue })
      }
    }
    res.status(200).json({ ok: true, message: result.message })
  } catch (e) {
    const { printFailureResponse } = await import('../../services/print-bracelet.service')
    const fail = printFailureResponse(e instanceof Error ? e.message : String(e))
    sendErr(res, fail.message, 502, fail.code, fail.solutions)
  }
})

v1Router.post('/print/label', async (req, res) => {
  const { getPrintAgentUrl } = await import('../../config/env')
  try {
    const agentRes = await fetch(`${getPrintAgentUrl()}/print/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10000),
    })
    const data = await agentRes.json()
    res.status(agentRes.ok ? 200 : 502).json(data)
  } catch (e) {
    sendErr(res, `打印 Agent 不可用: ${e instanceof Error ? e.message : String(e)}`, 502)
  }
})
