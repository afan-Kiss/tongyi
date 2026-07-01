import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  getAnchorRanking,
  getImportBatches,
  getLiveSessionDetail,
  getLiveSessions,
  getLiveSummary,
  getProductAnalysis,
  getRefundAnalysis,
  getSuggestions,
  importLiveData,
} from './liveAnalysis.service'

export const liveAnalysisRouter = Router()

function periodQuery(req: { query: Record<string, unknown> }) {
  return {
    period: String(req.query.period || 'month') as 'today' | 'week' | 'month' | 'custom',
    startDate: String(req.query.startDate || ''),
    endDate: String(req.query.endDate || ''),
  }
}

liveAnalysisRouter.get('/summary', async (req, res) => {
  try {
    sendOk(res, await getLiveSummary(periodQuery(req)))
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '汇总失败', 500)
  }
})

liveAnalysisRouter.get('/sessions', async (req, res) => {
  try {
    const data = await getLiveSessions({
      ...periodQuery(req),
      anchorName: String(req.query.anchorName || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
    })
    sendOk(res, data)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '查询失败', 500)
  }
})

liveAnalysisRouter.get('/sessions/:id', async (req, res) => {
  try {
    const row = await getLiveSessionDetail(req.params.id)
    if (!row) {
      sendErr(res, '场次不存在', 404)
      return
    }
    sendOk(res, row)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '查询失败', 500)
  }
})

liveAnalysisRouter.get('/anchors/ranking', async (req, res) => {
  try {
    sendOk(res, await getAnchorRanking(periodQuery(req)))
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '榜单失败', 500)
  }
})

liveAnalysisRouter.get('/refunds', async (req, res) => {
  try {
    sendOk(res, await getRefundAnalysis(periodQuery(req)))
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '退款分析失败', 500)
  }
})

liveAnalysisRouter.get('/products', async (req, res) => {
  try {
    sendOk(res, await getProductAnalysis(periodQuery(req)))
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '商品分析失败', 500)
  }
})

liveAnalysisRouter.get('/suggestions', async (req, res) => {
  try {
    sendOk(res, await getSuggestions(periodQuery(req)))
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '建议生成失败', 500)
  }
})

liveAnalysisRouter.get('/import-batches', async (_req, res) => {
  try {
    sendOk(res, await getImportBatches())
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '查询失败', 500)
  }
})

liveAnalysisRouter.post('/import', async (req, res) => {
  try {
    const result = await importLiveData(req.body || {})
    sendOk(res, result, result.message)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '导入失败', 400)
  }
})
