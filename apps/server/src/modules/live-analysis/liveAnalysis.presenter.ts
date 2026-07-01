import type { AnchorProfile, LiveImportBatch, LiveOrder, LiveSession } from '@prisma/client'

type SessionRow = LiveSession & { anchorProfile?: AnchorProfile | null; orders?: LiveOrder[] }

export const CALIBER_NOTES = {
  grossSalesAmount: '支付金额：顾客实际付出去的货款（含后来退款的单，先付后退也算进来）。',
  validSalesAmount: '有效成交：已完成/已签收，且没有正在处理或已成功的退款售后。不是“支付减退款”的简单算法。',
  refundAmount: '退款金额：有真实退款的订单，按订单号汇总后相加。',
  orderCount: '订单数：本场直播关联的支付订单数（导入或同步时按行计入）。',
}

export function presentSession(row: SessionRow) {
  const refundRate = row.grossSalesAmount > 0 ? row.refundAmount / row.grossSalesAmount : null
  return {
    id: row.id,
    sessionNo: row.sessionNo,
    title: row.title,
    anchorName: row.anchorName,
    anchorDisplayName: row.anchorProfile?.displayName ?? row.anchorName,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    platform: row.platform,
    grossSalesAmount: row.grossSalesAmount,
    validSalesAmount: row.validSalesAmount,
    orderCount: row.orderCount,
    refundAmount: row.refundAmount,
    refundCount: row.refundCount,
    afterSaleAmount: row.afterSaleAmount,
    refundRate,
    status: row.status,
    plainSummary: buildSessionPlainSummary(row),
    orderCountLabel: `${row.orderCount} 单`,
    orders: (row.orders ?? []).map(presentOrder),
  }
}

export function presentOrder(row: LiveOrder) {
  return {
    id: row.id,
    orderNo: row.orderNo,
    buyerName: row.buyerName,
    productName: row.productName,
    skuName: row.skuName,
    amount: row.amount,
    validAmount: row.validAmount,
    refundAmount: row.refundAmount,
    afterSaleStatus: row.afterSaleStatus,
    paidAt: row.paidAt?.toISOString() ?? null,
  }
}

function buildSessionPlainSummary(row: LiveSession) {
  const parts = [`${row.anchorName} 直播`]
  if (row.validSalesAmount > 0) parts.push(`有效成交 ¥${row.validSalesAmount.toFixed(0)}`)
  if (row.refundAmount > 0) parts.push(`退款 ¥${row.refundAmount.toFixed(0)}`)
  return parts.join('，')
}

export function presentImportBatch(row: LiveImportBatch) {
  const statusLabels: Record<string, string> = {
    pending: '等待中',
    processing: '导入中',
    completed: '已完成',
    failed: '失败',
    unsupported: '暂不支持',
  }
  return {
    id: row.id,
    source: row.source,
    filename: row.filename,
    status: row.status,
    statusLabel: statusLabels[row.status] ?? row.status,
    importedCount: row.importedCount,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}
