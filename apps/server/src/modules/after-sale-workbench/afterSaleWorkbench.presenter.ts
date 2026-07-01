import type { QianfanRawAfterSale, OrderFinanceAlert } from '@prisma/client'
import { needsAttention } from './afterSaleWorkbench.repository'

export function presentAfterSaleItem(
  row: QianfanRawAfterSale & { shop?: { shopName: string } | null },
  financeAlerts: OrderFinanceAlert[] = [],
) {
  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(row.rawJson || '{}') as Record<string, unknown>
  } catch {
    raw = {}
  }
  const financePending = financeAlerts.some((a) => a.status === 'pending')
  const financeHandled = financeAlerts.some((a) => a.status === 'handled')
  return {
    id: row.id,
    shopName: row.shop?.shopName,
    orderNo: row.orderNo,
    afterSaleNo: row.afterSaleNo,
    afterSaleType: row.afterSaleType,
    status: row.status,
    refundAmount: row.refundAmount,
    reason: row.reason,
    handleStatus: row.handleStatus,
    handledAt: row.handledAt?.toISOString() || null,
    note: row.note,
    syncedAt: row.syncedAt.toISOString(),
    raw,
    financePending,
    financeHandled,
    hint: needsAttention(row.status)
      ? row.refundAmount > 0
        ? '这单涉及退款，建议今天处理并确认财务是否已记账。'
        : '这单售后还在进行中，建议今天跟进进度。'
      : financePending
        ? '售后状态已稳定，但财务提醒仍待确认。'
        : undefined,
  }
}
