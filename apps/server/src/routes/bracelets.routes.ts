import { Router } from 'express'
import {
  applyInbound,
  applyOutbound,
  createBracelet,
  findByCertNo,
  getDashboardStats,
  listBracelets,
  revertOperation,
} from '../services/bracelet.service'
import { fetchExcelSnapshot } from '../services/excel-bridge.service'
import { CERT_NO_REGEX } from '../config/env'
import { normalizeCertNo } from '../services/inventory.service'

export const braceletsRouter = Router()

braceletsRouter.get('/stats', async (_req, res) => {
  const stats = await getDashboardStats()
  res.json({ ok: true, data: stats })
})

braceletsRouter.get('/', async (req, res) => {
  const data = await listBracelets({
    q: String(req.query.q || ''),
    inStockOnly: req.query.inStockOnly === '1',
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 50),
  })
  res.json({ ok: true, data })
})

braceletsRouter.get('/by-cert/:certNo', async (req, res) => {
  const certNo = normalizeCertNo(req.params.certNo)
  const bracelet = await findByCertNo(certNo)
  if (!bracelet) {
    res.status(404).json({ ok: false, message: `编号 ${certNo} 不存在` })
    return
  }
  res.json({ ok: true, data: bracelet })
})

braceletsRouter.post('/outbound', async (req, res) => {
  const result = await applyOutbound(req.body)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json({ ok: true, data: result })
})

braceletsRouter.post('/inbound', async (req, res) => {
  const result = await applyInbound(req.body)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json({ ok: true, data: result })
})

braceletsRouter.post('/new', async (req, res) => {
  const certNo = normalizeCertNo(req.body.certNo || '')
  if (!CERT_NO_REGEX.test(certNo)) {
    res.status(400).json({ ok: false, message: '编号格式不正确' })
    return
  }
  const result = await createBracelet({ ...req.body, certNo })
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json({ ok: true, data: result })
})

braceletsRouter.get('/excel-snapshot/:certNo', async (req, res) => {
  const result = await fetchExcelSnapshot(req.params.certNo)
  res.json({ ok: result.ok, data: result, message: result.message })
})

braceletsRouter.post('/revert/:logId', async (req, res) => {
  const result = await revertOperation(req.params.logId)
  if (!result.ok) {
    res.status(400).json(result)
    return
  }
  res.json(result)
})
