import type { LiveSession } from '@prisma/client'
import { computeRefundRate } from './liveAnalysis.metrics'
import type { AnchorRankingRow, LiveSuggestion } from './liveAnalysis.types'

export function buildAnchorRanking(sessions: LiveSession[]): AnchorRankingRow[] {
  const map = new Map<
    string,
    { gross: number; valid: number; orders: number; sessions: number; refund: number }
  >()
  for (const s of sessions) {
    const cur = map.get(s.anchorName) ?? { gross: 0, valid: 0, orders: 0, sessions: 0, refund: 0 }
    cur.gross += s.grossSalesAmount
    cur.valid += s.validSalesAmount
    cur.orders += s.orderCount
    cur.sessions += 1
    cur.refund += s.refundAmount
    map.set(s.anchorName, cur)
  }
  return [...map.entries()]
    .map(([anchorName, v], idx) => {
      const refundRate = computeRefundRate(v.refund, v.gross)
      let plainSummary = `${anchorName} 有效成交 ¥${v.valid.toFixed(0)}`
      if (v.valid > 0 && refundRate !== null && refundRate < 0.08) {
        plainSummary += '，退款控制得不错，值得多排场次'
      } else if (refundRate !== null && refundRate >= 0.15) {
        plainSummary += '，退款偏高，建议一起复盘话术和品项'
      }
      return {
        rank: idx + 1,
        anchorName,
        displayName: anchorName,
        validSalesAmount: v.valid,
        grossSalesAmount: v.gross,
        orderCount: v.orders,
        sessionCount: v.sessions,
        refundAmount: v.refund,
        refundRate,
        plainSummary,
      }
    })
    .sort((a, b) => b.validSalesAmount - a.validSalesAmount)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}

export function buildSuggestions(sessions: LiveSession[]): LiveSuggestion[] {
  if (!sessions.length) {
    return [
      {
        id: 'empty-data',
        type: 'data',
        priority: 'medium',
        title: '还没有直播数据',
        message: '可以先从「数据导入」上传 CSV，或打开旧主播分析系统查看历史数据。',
        action: '去导入页面添加第一场数据，或联系管理员同步小红书订单。',
      },
    ]
  }

  const ranking = buildAnchorRanking(sessions)
  const suggestions: LiveSuggestion[] = []
  const top = ranking[0]
  if (top && top.validSalesAmount > 0) {
    suggestions.push({
      id: `schedule-${top.anchorName}`,
      type: 'schedule',
      priority: 'high',
      title: `给 ${top.anchorName} 多排优质时段`,
      message: `${top.anchorName} 本期有效成交 ¥${top.validSalesAmount.toFixed(0)}，排在第一位。`,
      action: `下周优先给 ${top.anchorName} 安排流量好的时段，准备好主推款和备用款。`,
      anchorName: top.anchorName,
    })
  }

  const highRefund = ranking.filter((r) => r.refundRate !== null && r.refundRate >= 0.12 && r.grossSalesAmount >= 500)
  for (const row of highRefund.slice(0, 2)) {
    suggestions.push({
      id: `refund-${row.anchorName}`,
      type: 'refund_review',
      priority: 'high',
      title: `${row.anchorName} 的退款需要一起看一下`,
      message: `退款约占销售额 ${((row.refundRate ?? 0) * 100).toFixed(1)}%，不是批评，是想帮他把成交留住。`,
      action: `和 ${row.anchorName} 过一遍最近退款订单：是尺码问题、描述问题还是物流问题，对症改话术。`,
      anchorName: row.anchorName,
    })
  }

  const steady = ranking.filter((r) => r.validSalesAmount > 0 && (r.refundRate ?? 1) < 0.1)
  for (const row of steady.slice(1, 3)) {
    suggestions.push({
      id: `encourage-${row.anchorName}`,
      type: 'encourage',
      priority: 'medium',
      title: `${row.anchorName} 表现稳，可以加大练习`,
      message: `${row.anchorName} 有效成交 ¥${row.validSalesAmount.toFixed(0)}，退款率控制得好。`,
      action: `让 ${row.anchorName} 在直播间多试 1～2 款新品，积累爆款经验。`,
      anchorName: row.anchorName,
    })
  }

  const totalRefund = sessions.reduce((s, x) => s + x.refundAmount, 0)
  const totalGross = sessions.reduce((s, x) => s + x.grossSalesAmount, 0)
  if (totalGross > 0 && totalRefund / totalGross >= 0.1) {
    suggestions.push({
      id: 'after-sales-team',
      type: 'after_sales',
      priority: 'medium',
      title: '售后响应再快一点',
      message: `本期整体退款 ¥${totalRefund.toFixed(0)}，及时处理售后能减少退货升级。`,
      action: '每天固定两次查售后工作台，能退就退、能换就换，别让买家等太久。',
    })
  }

  if (suggestions.length < 3) {
    suggestions.push({
      id: 'import-more',
      type: 'data',
      priority: 'low',
      title: '数据越全，建议越准',
      message: '当前基于 tongyi 已导入的场次数据生成建议。',
      action: '持续导入直播订单，或等待小红书 API 同步迁入后，建议会自动更细。',
    })
  }

  return suggestions.slice(0, 8)
}
