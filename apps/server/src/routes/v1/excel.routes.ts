import { Router } from 'express'
import multer from 'multer'
import { exportWorkbook, importWorkbook } from '../../adapters/excel/excel-file.adapter'
import {
  getCertIndexStatus,
  refreshCertIndex,
  searchCertIndex,
} from '../../services/excel-cert-index.service'
import { sendErr, sendOk } from '../../utils/api-response'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

export const excelV1Router = Router()

excelV1Router.get('/export', async (_req, res) => {
  const buf = await exportWorkbook()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=inventory-export.xlsx')
  res.send(buf)
})

excelV1Router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return sendErr(res, '请上传 Excel 文件')
  sendOk(res, await importWorkbook(req.file.buffer))
})

excelV1Router.get('/cert-index/status', (_req, res) => {
  sendOk(res, getCertIndexStatus())
})

excelV1Router.post('/cert-index/refresh', async (_req, res) => {
  sendOk(res, await refreshCertIndex(true))
})

excelV1Router.get('/cert-index/search', (req, res) => {
  const q = String(req.query.q || '')
  const limit = Number(req.query.limit) || 20
  sendOk(res, { items: searchCertIndex(q, limit) })
})
