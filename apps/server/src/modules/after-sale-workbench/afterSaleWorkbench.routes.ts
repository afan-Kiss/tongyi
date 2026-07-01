import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  fetchAfterSaleItems,
  fetchAfterSaleOverview,
  fetchPendingAfterSales,
  fetchRefunds,
  handleAfterSale,
  ignoreAfterSale,
} from './afterSaleWorkbench.service'

export const afterSaleWorkbenchRouter = Router()

afterSaleWorkbenchRouter.get('/overview', async (_req, res) => {
  try {
    sendOk(res, await fetchAfterSaleOverview())
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

afterSaleWorkbenchRouter.get('/items', async (req, res) => {
  try {
    const hs = String(req.query.handleStatus || '')
    sendOk(res, await fetchAfterSaleItems({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
      handleStatus: (['pending', 'handled', 'ignored'] as const).includes(hs as 'pending')
        ? (hs as 'pending' | 'handled' | 'ignored')
        : undefined,
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

afterSaleWorkbenchRouter.get('/refunds', async (req, res) => {
  try {
    sendOk(res, await fetchRefunds({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

afterSaleWorkbenchRouter.get('/pending', async (req, res) => {
  try {
    sendOk(res, await fetchPendingAfterSales({
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

afterSaleWorkbenchRouter.post('/items/:id/mark-handled', async (req, res) => {
  try {
    sendOk(res, await handleAfterSale(req.params.id, String(req.body?.note || '')))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '标记失败', 500)
  }
})

afterSaleWorkbenchRouter.post('/items/:id/mark-ignored', async (req, res) => {
  try {
    sendOk(res, await ignoreAfterSale(req.params.id, String(req.body?.note || '')))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '标记失败', 500)
  }
})
