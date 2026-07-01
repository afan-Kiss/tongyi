import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  createRecord,
  exportRecordsCsv,
  getRecord,
  getSummary,
  listRecords,
  updateRecord,
} from './accounting.service'
import type { AccountingRecordType } from './accounting.types'

export const accountingRouter = Router()

accountingRouter.get('/records', async (req, res) => {
  try {
    const data = await listRecords({
      startDate: String(req.query.startDate || ''),
      endDate: String(req.query.endDate || ''),
      recordType: (req.query.recordType as AccountingRecordType | 'all') || 'all',
      status: (req.query.status as 'pending' | 'handled' | 'ignored' | 'all') || 'all',
      externalOrderNo: String(req.query.externalOrderNo || ''),
      logisticsNo: String(req.query.logisticsNo || ''),
      buyerPhone: String(req.query.buyerPhone || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
    })
    sendOk(res, data)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '查询失败', 500)
  }
})

accountingRouter.get('/summary', async (req, res) => {
  try {
    const data = await getSummary(
      String(req.query.period || 'today'),
      String(req.query.startDate || ''),
      String(req.query.endDate || ''),
    )
    sendOk(res, data)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '汇总失败', 500)
  }
})

accountingRouter.get('/records/:id', async (req, res) => {
  try {
    const row = await getRecord(req.params.id)
    if (!row) {
      sendErr(res, '记录不存在', 404)
      return
    }
    sendOk(res, row)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '查询失败', 500)
  }
})

accountingRouter.post('/records', async (req, res) => {
  try {
    const row = await createRecord(req.body || {})
    sendOk(res, row, '已创建记账记录')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建失败', 400)
  }
})

accountingRouter.patch('/records/:id', async (req, res) => {
  try {
    const row = await updateRecord(req.params.id, req.body || {})
    sendOk(res, row, '已更新')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '更新失败', 400)
  }
})

accountingRouter.post('/records/:id/handled', async (req, res) => {
  try {
    const row = await updateRecord(req.params.id, { customerPaymentStatus: 'handled' })
    sendOk(res, row, '已标记为已处理')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '更新失败', 400)
  }
})

accountingRouter.get('/export/csv', async (req, res) => {
  try {
    const csv = await exportRecordsCsv({
      startDate: String(req.query.startDate || ''),
      endDate: String(req.query.endDate || ''),
      recordType: (req.query.recordType as AccountingRecordType | 'all') || 'all',
      status: (req.query.status as 'pending' | 'handled' | 'ignored' | 'all') || 'all',
    })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="accounting-export.csv"')
    res.send('\uFEFF' + csv)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '导出失败', 500)
  }
})
