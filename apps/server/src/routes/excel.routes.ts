import { Router } from 'express'
import multer from 'multer'
import { exportToExcel, importFromExcel } from '../services/excel.service'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

export const excelRouter = Router()

excelRouter.get('/export', async (_req, res) => {
  const buf = await exportToExcel()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename=inventory-export.xlsx')
  res.send(buf)
})

excelRouter.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, message: '请上传 Excel 文件' })
    return
  }
  const result = await importFromExcel(req.file.buffer)
  res.json({ ok: true, data: result })
})
