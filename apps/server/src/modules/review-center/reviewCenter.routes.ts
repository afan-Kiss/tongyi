import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  fetchNegativeReviews,
  fetchPendingReplies,
  fetchReviewOverview,
  fetchReviewStats,
  fetchReviews,
  handleReview,
  ignoreReview,
} from './reviewCenter.service'

export const reviewCenterRouter = Router()

reviewCenterRouter.get('/overview', async (_req, res) => {
  try {
    sendOk(res, await fetchReviewOverview())
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

reviewCenterRouter.get('/reviews', async (req, res) => {
  try {
    const hs = String(req.query.handleStatus || '')
    sendOk(res, await fetchReviews({
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

reviewCenterRouter.get('/pending-replies', async (req, res) => {
  try {
    sendOk(res, await fetchPendingReplies({
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

reviewCenterRouter.get('/negative', async (req, res) => {
  try {
    sendOk(res, await fetchNegativeReviews({
      shopId: String(req.query.shopId || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 30),
    }))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

reviewCenterRouter.get('/stats', async (_req, res) => {
  try {
    sendOk(res, await fetchReviewStats())
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '加载失败', 500)
  }
})

reviewCenterRouter.post('/reviews/:id/mark-handled', async (req, res) => {
  try {
    sendOk(res, await handleReview(req.params.id, String(req.body?.note || '')))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '标记失败', 500)
  }
})

reviewCenterRouter.post('/reviews/:id/mark-ignored', async (req, res) => {
  try {
    sendOk(res, await ignoreReview(req.params.id, String(req.body?.note || '')))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '标记失败', 500)
  }
})
