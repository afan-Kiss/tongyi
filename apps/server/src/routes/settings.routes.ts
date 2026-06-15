import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { ensureDefaultLabelTemplate, getSettings, getSystemStatus, saveSettings } from '../services/settings.service'

export const settingsRouter = Router()

settingsRouter.get('/', async (_req, res) => {
  const settings = await getSettings()
  res.json({ ok: true, data: settings })
})

settingsRouter.put('/', async (req, res) => {
  const settings = await saveSettings(req.body)
  res.json({ ok: true, data: settings })
})

settingsRouter.get('/status', async (_req, res) => {
  const status = await getSystemStatus()
  res.json({ ok: true, data: status })
})

settingsRouter.get('/label-template', async (_req, res) => {
  const tpl = await ensureDefaultLabelTemplate()
  res.json({ ok: true, data: { ...tpl, fields: JSON.parse(tpl.fieldsJson) } })
})

settingsRouter.put('/label-template', async (req, res) => {
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
  res.json({ ok: true, data: { ...updated, fields: JSON.parse(updated.fieldsJson) } })
})
