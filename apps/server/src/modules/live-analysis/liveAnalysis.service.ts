import {
  getSessionById,
  listImportBatches,
  listRefundOrders,
  listOrdersForProducts,
  listSessions,
  sessionsForRanking,
} from './liveAnalysis.repository'
import { presentImportBatch, presentSession } from './liveAnalysis.presenter'
import { aggregateProducts, buildSummary } from './liveAnalysis.metrics'
import { buildAnchorRanking, buildSuggestions } from './liveAnalysis.suggestions'
import { importCsvContent, importExcelPlaceholder } from './liveAnalysis.import'
import type { LiveAnalysisPeriodFilter, LiveSessionFilter, ImportLiveDataInput } from './liveAnalysis.types'

export async function getLiveSummary(filter: LiveAnalysisPeriodFilter) {
  return buildSummary(filter)
}

export async function getLiveSessions(filter: LiveSessionFilter) {
  const result = await listSessions(filter)
  return {
    ...result,
    items: result.items.map(presentSession),
  }
}

export async function getLiveSessionDetail(id: string) {
  const row = await getSessionById(id)
  if (!row) return null
  return presentSession(row)
}

export async function getAnchorRanking(filter: LiveAnalysisPeriodFilter) {
  const sessions = await sessionsForRanking(filter)
  return { items: buildAnchorRanking(sessions), period: filter.period || 'month' }
}

export async function getRefundAnalysis(filter: LiveAnalysisPeriodFilter) {
  const rows = await listRefundOrders(filter)
  return {
    items: rows.map((r) => ({
      orderNo: r.orderNo,
      sessionNo: r.session.sessionNo,
      anchorName: r.session.anchorName,
      productName: r.productName,
      amount: r.amount,
      refundAmount: r.refundAmount,
      afterSaleStatus: r.afterSaleStatus,
      paidAt: r.paidAt?.toISOString() ?? null,
      plainSummary: `${r.session.anchorName} · ${r.productName || '商品'} 退款 ¥${r.refundAmount.toFixed(2)}`,
    })),
    totalRefund: rows.reduce((s, r) => s + r.refundAmount, 0),
  }
}

export async function getProductAnalysis(filter: LiveAnalysisPeriodFilter) {
  const rows = await listOrdersForProducts(filter)
  return { items: aggregateProducts(rows) }
}

export async function getSuggestions(filter: LiveAnalysisPeriodFilter) {
  const sessions = await sessionsForRanking(filter)
  return { items: buildSuggestions(sessions) }
}

export async function getImportBatches() {
  const rows = await listImportBatches()
  return { items: rows.map(presentImportBatch) }
}

export async function importLiveData(input: ImportLiveDataInput) {
  const format = input.format || 'csv'
  if (format === 'excel') {
    return importExcelPlaceholder(input.filename)
  }
  if (format === 'csv') {
    if (!input.content?.trim()) throw new Error('请上传 CSV 内容')
    return importCsvContent(input.content, input.filename)
  }
  return importExcelPlaceholder(input.filename)
}
