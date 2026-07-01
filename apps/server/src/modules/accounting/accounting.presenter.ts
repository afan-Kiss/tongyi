import type { AccountingAttachment, AccountingRecord, OrderFinanceAlert } from '@prisma/client'

type RecordWithRelations = AccountingRecord & {
  attachments?: AccountingAttachment[]
  financeAlerts?: Pick<OrderFinanceAlert, 'id' | 'status'>[]
}

const TYPE_LABELS: Record<string, string> = {
  income: '收入',
  expense: '支出',
  cashback: '返现',
  refund: '退款',
  note: '备注提醒',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  handled: '已处理',
  ignored: '已忽略',
}

export function presentAccountingRecord(record: RecordWithRelations) {
  return {
    id: record.id,
    recordNo: record.recordNo,
    recordType: record.recordType,
    recordTypeLabel: TYPE_LABELS[record.recordType] ?? record.recordType,
    businessType: record.businessType,
    amount: record.amount,
    occurredAt: record.occurredAt.toISOString(),
    summary: record.summary,
    remark: record.remark,
    paySource: record.paySource,
    externalOrderNo: record.externalOrderNo,
    logisticsNo: record.logisticsNo,
    trackingNo: record.trackingNo,
    buyerName: record.buyerName,
    buyerPhone: record.buyerPhone,
    braceletCode: record.braceletCode,
    certNo: record.certNo,
    reimbursementStatus: record.reimbursementStatus,
    customerPaymentStatus: record.customerPaymentStatus,
    statusLabel: STATUS_LABELS[record.customerPaymentStatus] ?? record.customerPaymentStatus,
    isVoided: record.isVoided,
    handledAt: record.handledAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    attachments: (record.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
    })),
    financeAlertIds: (record.financeAlerts ?? []).map((a) => a.id),
    hasPendingAlert: (record.financeAlerts ?? []).some((a) => a.status === 'pending'),
  }
}
