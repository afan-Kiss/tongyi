import type { OrderFinanceAlert } from '@prisma/client'

export type FinanceAlertType = 'cashback' | 'expense' | 'refund' | 'note'

export interface ScanFinanceContext {
  orderNo?: string | null
  logisticsNo?: string | null
  trackingNo?: string | null
  buyerPhone?: string | null
  buyerName?: string | null
  certNo?: string | null
  braceletId?: string | null
}

export interface CreateFinanceAlertInput {
  source?: 'jizhang' | 'manual' | 'sync'
  orderNo?: string
  logisticsNo?: string
  trackingNo?: string
  buyerName?: string
  buyerPhone?: string
  type: FinanceAlertType
  amount?: number
  title?: string
  message?: string
  externalId?: string
  rawJson?: Record<string, unknown>
}

export const ALERT_TYPE_LABELS: Record<FinanceAlertType, string> = {
  cashback: '返现',
  expense: '额外支出',
  refund: '退款',
  note: '财务备注',
}

export function presentFinanceAlert(row: OrderFinanceAlert) {
  const type = row.type as FinanceAlertType
  return {
    id: row.id,
    source: row.source,
    orderNo: row.orderNo,
    logisticsNo: row.logisticsNo,
    trackingNo: row.trackingNo,
    buyerName: row.buyerName,
    buyerPhone: row.buyerPhone,
    type,
    typeLabel: ALERT_TYPE_LABELS[type] || row.type,
    amount: row.amount,
    title: row.title,
    message: row.message,
    status: row.status,
    externalId: row.externalId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    handledAt: row.handledAt?.toISOString() || null,
    plainSummary: buildPlainSummary(row),
  }
}

function buildPlainSummary(row: OrderFinanceAlert): string {
  const type = row.type as FinanceAlertType
  const amt = row.amount != null ? `¥${row.amount}` : ''
  const reason = row.message || row.title || ''
  switch (type) {
    case 'cashback':
      return `这单有返现${amt ? `：${amt}` : ''}${reason ? `，原因：${reason}` : ''}。出库前请确认是否已处理。`
    case 'expense':
      return `这单有额外支出${amt ? `：${amt}` : ''}${reason ? `，原因：${reason}` : ''}。请确认记账。`
    case 'refund':
      return `这单有关联退款记录${reason ? `：${reason}` : ''}，请核对后再操作。`
    default:
      return `这单有财务备注${reason ? `：${reason}` : ''}。`
  }
}
