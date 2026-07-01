import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  createShop,
  getAfterSalesView,
  getJobView,
  getJobsView,
  getLiveSessionsView,
  getLogsView,
  getOrdersView,
  getReviewsView,
  getShopsView,
  getSyncOverview,
  patchShop,
  runAllShopsSync,
  runShopSync,
} from './qianfanSync.service'
import type { QianfanSyncType } from './qianfanSync.types'

export const qianfanSyncRouter = Router()

function parseSyncType(v: unknown): QianfanSyncType {
  const s = String(v || 'all') as QianfanSyncType
  const allowed: QianfanSyncType[] = ['orders', 'after_sales', 'live', 'reviews', 'shop_score', 'all']
  return allowed.includes(s) ? s : 'all'
}

qianfanSyncRouter.get('/overview', async (_req, res) => {
  try {
    sendOk(res, await getSyncOverview())
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

qianfanSyncRouter.get('/shops', async (_req, res) => {
  try {
    sendOk(res, await getShopsView())
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载店铺失败', 500)
  }
})

qianfanSyncRouter.post('/shops', async (req, res) => {
  try {
    const shopName = String(req.body?.shopName || '').trim()
    if (!shopName) return sendErr(res, '店铺名称不能为空', 400)
    sendOk(res, await createShop({ shopName, shopTitle: String(req.body?.shopTitle || '') }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '创建失败', 500)
  }
})

qianfanSyncRouter.patch('/shops/:id', async (req, res) => {
  try {
    sendOk(res, await patchShop(req.params.id, req.body || {}))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '更新失败', 500)
  }
})

qianfanSyncRouter.get('/jobs', async (req, res) => {
  try {
    sendOk(res, await getJobsView(Number(req.query.limit || 50)))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载任务失败', 500)
  }
})

qianfanSyncRouter.get('/jobs/:id', async (req, res) => {
  try {
    const row = await getJobView(req.params.id)
    if (!row) return sendErr(res, '任务不存在', 404)
    sendOk(res, row)
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

qianfanSyncRouter.post('/jobs', async (req, res) => {
  try {
    const shopId = String(req.body?.shopId || '').trim()
    const syncType = parseSyncType(req.body?.syncType)
    if (!shopId) return sendErr(res, '请选择店铺', 400)
    sendOk(res, await runShopSync(shopId, syncType))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '同步失败', 500)
  }
})

async function runAll(res: import('express').Response, syncType: QianfanSyncType) {
  try {
    sendOk(res, await runAllShopsSync(syncType))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '同步失败', 500)
  }
}

qianfanSyncRouter.post('/run-all', (req, res) => void runAll(res, parseSyncType(req.body?.syncType || 'all')))
qianfanSyncRouter.post('/run-orders', (_req, res) => void runAll(res, 'orders'))
qianfanSyncRouter.post('/run-after-sales', (_req, res) => void runAll(res, 'after_sales'))
qianfanSyncRouter.post('/run-live', (_req, res) => void runAll(res, 'live'))
qianfanSyncRouter.post('/run-reviews', (_req, res) => void runAll(res, 'reviews'))

qianfanSyncRouter.get('/orders', async (req, res) => {
  try {
    sendOk(res, await getOrdersView({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
      q: String(req.query.q || ''),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载订单失败', 500)
  }
})

qianfanSyncRouter.get('/after-sales', async (req, res) => {
  try {
    sendOk(res, await getAfterSalesView({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载售后失败', 500)
  }
})

qianfanSyncRouter.get('/live-sessions', async (req, res) => {
  try {
    sendOk(res, await getLiveSessionsView({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载直播场次失败', 500)
  }
})

qianfanSyncRouter.get('/reviews', async (req, res) => {
  try {
    sendOk(res, await getReviewsView({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载评价失败', 500)
  }
})

qianfanSyncRouter.get('/logs', async (req, res) => {
  try {
    sendOk(res, await getLogsView({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 50),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载日志失败', 500)
  }
})
