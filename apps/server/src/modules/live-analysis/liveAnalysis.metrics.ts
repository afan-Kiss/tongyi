import { parseDateRange, aggregateSessions } from './liveAnalysis.repository'
import { CALIBER_NOTES } from './liveAnalysis.presenter'
import type { LiveAnalysisPeriodFilter, LiveAnalysisSummary } from './liveAnalysis.types'

export async function buildSummary(filter: LiveAnalysisPeriodFilter): Promise<LiveAnalysisSummary> {
  const range = parseDateRange(filter)
  const agg = await aggregateSessions(filter)
  return {
    period: range.period,
    startDate: range.startDate,
    endDate: range.endDate,
    ...agg,
    caliberNotes: CALIBER_NOTES,
  }
}

export function computeRefundRate(refundAmount: number, grossAmount: number): number | null {
  if (grossAmount <= 0) return null
  return Math.round((refundAmount / grossAmount) * 1000) / 1000
}

export function aggregateProducts(
  rows: { productName: string | null; amount: number; validAmount: number; refundAmount: number }[],
) {
  const map = new Map<string, { orderCount: number; grossAmount: number; validAmount: number; refundAmount: number }>()
  for (const row of rows) {
    const name = (row.productName || '未命名商品').trim()
    const cur = map.get(name) ?? { orderCount: 0, grossAmount: 0, validAmount: 0, refundAmount: 0 }
    cur.orderCount += 1
    cur.grossAmount += row.amount
    cur.validAmount += row.validAmount
    cur.refundAmount += row.refundAmount
    map.set(name, cur)
  }
  return [...map.entries()]
    .map(([productName, v]) => ({
      productName,
      ...v,
      refundRate: computeRefundRate(v.refundAmount, v.grossAmount),
      plainSummary:
        v.refundAmount > 0
          ? `${productName}：成交 ${v.orderCount} 单，退款 ¥${v.refundAmount.toFixed(0)}，建议关注售后话术`
          : `${productName}：成交 ${v.orderCount} 单，表现稳定`,
    }))
    .sort((a, b) => b.validAmount - a.validAmount)
}
