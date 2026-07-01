import type { AccountingRecord } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { updateAccountingRecord } from './accounting.repository'

const TYPE_TITLES: Record<string, string> = {
  expense: '支出提醒',
  cashback: '返现提醒',
  refund: '退款提醒',
  note: '备注提醒',
}

function norm(v?: string | null) {
  return String(v || '').trim()
}

export async function createFinanceAlertForAccounting(record: AccountingRecord) {
  const orderNo = norm(record.externalOrderNo)
  const logisticsNo = norm(record.logisticsNo)
  const trackingNo = norm(record.trackingNo)
  const buyerPhone = norm(record.buyerPhone)

  if (!orderNo && !logisticsNo && !trackingNo && !buyerPhone) return null

  const existing = await prisma.orderFinanceAlert.findFirst({
    where: {
      accountingRecordId: record.id,
      status: 'pending',
    },
  })
  if (existing) return existing

  const dupWhere: Array<Record<string, string>> = []
  if (orderNo) dupWhere.push({ orderNo })
  if (logisticsNo) dupWhere.push({ logisticsNo })
  if (trackingNo) dupWhere.push({ trackingNo })

  if (dupWhere.length) {
    const dup = await prisma.orderFinanceAlert.findFirst({
      where: {
        type: record.recordType,
        status: 'pending',
        accountingRecordId: record.id,
        OR: dupWhere,
      },
    })
    if (dup) return dup
  }

  const title = TYPE_TITLES[record.recordType] ?? '财务提醒'
  const message =
    record.summary?.trim() ||
    `${title}：¥${record.amount}${orderNo ? `，订单 ${orderNo}` : ''}${logisticsNo ? `，物流 ${logisticsNo}` : ''}`

  return prisma.orderFinanceAlert.create({
    data: {
      source: 'accounting',
      orderNo: orderNo || null,
      logisticsNo: logisticsNo || null,
      trackingNo: trackingNo || null,
      buyerName: norm(record.buyerName) || null,
      buyerPhone: buyerPhone || null,
      type: record.recordType,
      amount: record.amount,
      title,
      message,
      externalId: record.recordNo,
      accountingRecordId: record.id,
      rawJson: JSON.stringify({ recordId: record.id, recordNo: record.recordNo }),
      status: 'pending',
    },
  })
}

export async function syncAccountingStatusFromAlert(recordId: string, status: 'handled' | 'ignored') {
  await updateAccountingRecord(recordId, {
    customerPaymentStatus: status,
    handledAt: new Date(),
  })
}
