import { prisma } from '../../lib/prisma'
import {
  countByStatus,
  createAccountingRecord,
  getAccountingRecordById,
  listAccountingRecords,
  sumByType,
  updateAccountingRecord,
} from './accounting.repository'
import { presentAccountingRecord } from './accounting.presenter'
import type {
  AccountingRecordFilter,
  AccountingRecordType,
  CreateAccountingRecordInput,
  UpdateAccountingRecordInput,
} from './accounting.types'
import { createFinanceAlertForAccounting, syncAccountingStatusFromAlert } from './accounting-finance-bridge'

function generateRecordNo() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `ACC${stamp}${rand}`
}

function resolvePeriodDates(period?: string, startDate?: string, endDate?: string) {
  const now = new Date()
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10)
  if (period === 'today') {
    const s = fmt(now)
    return { startDate: s, endDate: s, period: 'today' }
  }
  if (period === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now)
    mon.setDate(now.getDate() - day + 1)
    return { startDate: fmt(mon), endDate: fmt(now), period: 'week' }
  }
  if (period === 'month') {
    const mon = new Date(now.getFullYear(), now.getMonth(), 1)
    return { startDate: fmt(mon), endDate: fmt(now), period: 'month' }
  }
  return {
    startDate: startDate || fmt(now),
    endDate: endDate || fmt(now),
    period: period || 'custom',
  }
}

const ALERT_TYPES: AccountingRecordType[] = ['expense', 'cashback', 'refund', 'note']

export async function listRecords(filter: AccountingRecordFilter) {
  const result = await listAccountingRecords(filter)
  return {
    ...result,
    items: result.items.map(presentAccountingRecord),
  }
}

export async function getRecord(id: string) {
  const row = await getAccountingRecordById(id)
  if (!row) return null
  return presentAccountingRecord(row)
}

export async function createRecord(input: CreateAccountingRecordInput) {
  if (!input.amount || input.amount <= 0) {
    throw new Error('金额必须大于 0')
  }
  if (!input.recordType) {
    throw new Error('请选择记账类型')
  }

  const record = await createAccountingRecord({
    ...input,
    recordNo: generateRecordNo(),
  })

  const shouldAlert =
    input.createFinanceAlert !== false &&
    ALERT_TYPES.includes(input.recordType) &&
    Boolean(input.externalOrderNo || input.logisticsNo || input.trackingNo || input.buyerPhone)

  if (shouldAlert) {
    await createFinanceAlertForAccounting(record)
  }

  const full = await getAccountingRecordById(record.id)
  return presentAccountingRecord(full!)
}

export async function updateRecord(id: string, input: UpdateAccountingRecordInput) {
  const data: Record<string, unknown> = {}
  if (input.summary !== undefined) data.summary = input.summary?.trim() || null
  if (input.remark !== undefined) data.remark = input.remark?.trim() || null
  if (input.reimbursementStatus !== undefined) data.reimbursementStatus = input.reimbursementStatus
  if (input.customerPaymentStatus !== undefined) {
    data.customerPaymentStatus = input.customerPaymentStatus
    data.handledAt = input.customerPaymentStatus === 'pending' ? null : new Date()
    if (input.customerPaymentStatus === 'handled') {
      await syncAlertsForRecord(id, 'handled')
    }
    if (input.customerPaymentStatus === 'ignored') {
      await syncAlertsForRecord(id, 'ignored')
    }
  }
  const row = await updateAccountingRecord(id, data)
  return presentAccountingRecord(row)
}

async function syncAlertsForRecord(recordId: string, status: 'handled' | 'ignored') {
  const alerts = await prisma.orderFinanceAlert.findMany({
    where: { accountingRecordId: recordId, status: 'pending' },
  })
  for (const alert of alerts) {
    await prisma.orderFinanceAlert.update({
      where: { id: alert.id },
      data: { status, handledAt: new Date() },
    })
  }
}

export async function markRecordHandledFromAlert(alertId: string) {
  const alert = await prisma.orderFinanceAlert.findUnique({ where: { id: alertId } })
  if (!alert?.accountingRecordId) return
  await syncAccountingStatusFromAlert(alert.accountingRecordId, 'handled')
}

export async function markRecordIgnoredFromAlert(alertId: string) {
  const alert = await prisma.orderFinanceAlert.findUnique({ where: { id: alertId } })
  if (!alert?.accountingRecordId) return
  await syncAccountingStatusFromAlert(alert.accountingRecordId, 'ignored')
}

export async function getSummary(period?: string, startDate?: string, endDate?: string) {
  const range = resolvePeriodDates(period, startDate, endDate)
  const filter: AccountingRecordFilter = {
    startDate: range.startDate,
    endDate: range.endDate,
  }
  const [income, expense, cashback, refund, pendingCount, handledCount] = await Promise.all([
    sumByType(filter, 'income'),
    sumByType(filter, 'expense'),
    sumByType(filter, 'cashback'),
    sumByType(filter, 'refund'),
    countByStatus(filter, 'pending'),
    countByStatus(filter, 'handled'),
  ])
  return {
    period: range.period,
    startDate: range.startDate,
    endDate: range.endDate,
    incomeTotal: income.total,
    expenseTotal: expense.total,
    cashbackTotal: cashback.total,
    refundTotal: refund.total,
    pendingCount,
    handledCount,
  }
}

export async function exportRecordsCsv(filter: AccountingRecordFilter) {
  const { items } = await listAccountingRecords({ ...filter, page: 1, pageSize: 5000 })
  const header = '单号,类型,金额,发生时间,订单号,物流单号,买家,状态,摘要,备注\n'
  const lines = items.map((r) =>
    [
      r.recordNo,
      r.recordType,
      r.amount,
      r.occurredAt.toISOString(),
      r.externalOrderNo ?? '',
      r.logisticsNo ?? r.trackingNo ?? '',
      r.buyerName ?? r.buyerPhone ?? '',
      r.customerPaymentStatus,
      (r.summary ?? '').replace(/,/g, '，'),
      (r.remark ?? '').replace(/,/g, '，'),
    ].join(','),
  )
  return header + lines.join('\n')
}
