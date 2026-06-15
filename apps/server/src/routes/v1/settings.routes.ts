import { Router } from 'express'
import { checkExcelBridgeHealth } from '../../adapters/excel/excel-live.adapter'
import { getPrintAgentUrl } from '../../config/env'
import { ensureDefaultLabelTemplate, getSettings, getSystemStatus, saveSettings } from '../../services/settings.service'
import { prisma } from '../../lib/prisma'
import { sendOk } from '../../utils/api-response'

export const settingsV1Router = Router()

settingsV1Router.get('/', async (_req, res) => {
  sendOk(res, await getSettings())
})

settingsV1Router.put('/', async (req, res) => {
  sendOk(res, await saveSettings(req.body))
})

settingsV1Router.get('/status', async (_req, res) => {
  sendOk(res, await getSystemStatus())
})

settingsV1Router.get('/excel-bridge', async (_req, res) => {
  sendOk(res, await checkExcelBridgeHealth())
})

settingsV1Router.get('/label-template', async (_req, res) => {
  const tpl = await ensureDefaultLabelTemplate()
  sendOk(res, { ...tpl, fields: JSON.parse(tpl.fieldsJson) })
})

settingsV1Router.put('/label-template', async (req, res) => {
  const tpl = await ensureDefaultLabelTemplate()
  const updated = await prisma.labelTemplate.update({
    where: { id: tpl.id },
    data: {
      widthMm: req.body.widthMm ?? tpl.widthMm,
      heightMm: req.body.heightMm ?? tpl.heightMm,
      barcodeType: req.body.barcodeType ?? tpl.barcodeType,
      fieldsJson: JSON.stringify(req.body.fields ?? JSON.parse(tpl.fieldsJson)),
    },
  })
  sendOk(res, { ...updated, fields: JSON.parse(updated.fieldsJson) })
})
