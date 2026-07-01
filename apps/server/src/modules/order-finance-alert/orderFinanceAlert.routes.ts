import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  createFinanceAlert,
  markAlertHandled,
  markAlertIgnored,
  searchFinanceAlerts,
  syncFromJizhang,
} from './orderFinanceAlert.service'

export const orderFinanceAlertRouter = Router()

orderFinanceAlertRouter.get('/search', async (req, res) => {
  try {
    const result = await searchFinanceAlerts({
      orderNo: String(req.query.orderNo || ''),
      logisticsNo: String(req.query.logisticsNo || ''),
      trackingNo: String(req.query.trackingNo || ''),
      buyerPhone: String(req.query.buyerPhone || ''),
      status: String(req.query.status || 'pending'),
    })
    sendOk(res, result)
  } catch (err) {
    sendOk(res, {
      alerts: [],
      warning: '记账提醒暂时不可用，扫码不受影响',
    })
  }
})

orderFinanceAlertRouter.post('/', async (req, res) => {
  try {
    const alert = await createFinanceAlert(req.body || {})
    sendOk(res, alert, '已创建提醒')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建失败', 400)
  }
})

orderFinanceAlertRouter.post('/:id/handled', async (req, res) => {
  try {
    sendOk(res, await markAlertHandled(req.params.id), '已标记为已处理')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '更新失败', 400)
  }
})

orderFinanceAlertRouter.post('/:id/ignored', async (req, res) => {
  try {
    sendOk(res, await markAlertIgnored(req.params.id), '已忽略')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '更新失败', 400)
  }
})

orderFinanceAlertRouter.post('/sync-from-jizhang', async (_req, res) => {
  try {
    const result = await syncFromJizhang()
    sendOk(res, result, result.message)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '同步失败', 500)
  }
})
