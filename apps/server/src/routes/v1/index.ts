import { Router } from 'express'
import { operationsRouter } from './operations.routes'
import { inventoryRouter } from './inventory.routes'
import { mediaV1Router } from './media.routes'
import { excelV1Router } from './excel.routes'
import { settingsV1Router } from './settings.routes'
import { detailRouter } from './detail.routes'
import { photoRelayRouter } from './photo-relay.routes'
import { sendErr } from '../../utils/api-response'

export const v1Router = Router()

v1Router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'jade-inventory-api', version: 'v1' })
})

v1Router.use('/operations', operationsRouter)
v1Router.use('/inventory', inventoryRouter)
v1Router.use('/media', mediaV1Router)
v1Router.use('/excel', excelV1Router)
v1Router.use('/settings', settingsV1Router)

v1Router.use('/detail', detailRouter)
v1Router.use('/photo-relay', photoRelayRouter)

v1Router.post('/print/bracelet-tag', async (req, res) => {
  const { getPrintAgentUrl } = await import('../../config/env')
  const { queryByCertNo } = await import('../../services/inventory-query.service')
  const { getSettings } = await import('../../services/settings.service')
  const { braceletRepo } = await import('../../repositories/bracelet.repository')
  try {
    let bracelet = req.body?.bracelet
    if (!bracelet?.certNo && req.body?.certNo) {
      bracelet = await queryByCertNo(String(req.body.certNo))
    }
    if (!bracelet?.certNo) {
      return sendErr(res, '缺少 bracelet 或 certNo', 400)
    }
    const settings = await getSettings()
    const agentRes = await fetch(`${getPrintAgentUrl()}/print/bracelet-tag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bracelet,
        template: req.body?.template,
        printerName: req.body?.printerName || settings.printerName || undefined,
        side: req.body?.side || 'both',
      }),
      signal: AbortSignal.timeout(20000),
    })
    const data = (await agentRes.json().catch(() => ({ ok: false, message: '打印 Agent 返回无效响应' }))) as {
      ok?: boolean
      message?: string
    }
    if (agentRes.ok) {
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
    }
    if (!agentRes.ok || data.ok === false) {
      return sendErr(res, String(data?.message || '打印失败'), 502)
    }
    res.status(200).json(data)
  } catch (e) {
    sendErr(res, `打印 Agent 不可用: ${e instanceof Error ? e.message : String(e)}`, 502)
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
