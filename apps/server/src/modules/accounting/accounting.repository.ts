import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { AccountingRecordFilter, CreateAccountingRecordInput } from './accounting.types'

function buildWhere(filter: AccountingRecordFilter): Prisma.AccountingRecordWhereInput {
  const where: Prisma.AccountingRecordWhereInput = { isVoided: false }
  if (filter.recordType && filter.recordType !== 'all') where.recordType = filter.recordType
  if (filter.status && filter.status !== 'all') where.customerPaymentStatus = filter.status
  if (filter.externalOrderNo) where.externalOrderNo = { contains: filter.externalOrderNo }
  if (filter.logisticsNo) {
    where.OR = [
      { logisticsNo: { contains: filter.logisticsNo } },
      { trackingNo: { contains: filter.logisticsNo } },
    ]
  }
  if (filter.buyerPhone) where.buyerPhone = { contains: filter.buyerPhone }
  if (filter.startDate || filter.endDate) {
    where.occurredAt = {}
    if (filter.startDate) where.occurredAt.gte = new Date(`${filter.startDate}T00:00:00.000`)
    if (filter.endDate) where.occurredAt.lte = new Date(`${filter.endDate}T23:59:59.999`)
  }
  return where
}

export async function listAccountingRecords(filter: AccountingRecordFilter) {
  const page = Math.max(1, filter.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20))
  const where = buildWhere(filter)
  const [items, total] = await Promise.all([
    prisma.accountingRecord.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { attachments: true, financeAlerts: { select: { id: true, status: true } } },
    }),
    prisma.accountingRecord.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getAccountingRecordById(id: string) {
  return prisma.accountingRecord.findUnique({
    where: { id },
    include: { attachments: true, financeAlerts: true },
  })
}

export async function createAccountingRecord(input: CreateAccountingRecordInput & { recordNo: string }) {
  return prisma.accountingRecord.create({
    data: {
      recordNo: input.recordNo,
      recordType: input.recordType,
      businessType: input.businessType ?? 'normal',
      amount: input.amount,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      summary: input.summary?.trim() || null,
      remark: input.remark?.trim() || null,
      paySource: input.paySource?.trim() || null,
      externalOrderNo: input.externalOrderNo?.trim() || null,
      logisticsNo: input.logisticsNo?.trim() || null,
      trackingNo: input.trackingNo?.trim() || input.logisticsNo?.trim() || null,
      buyerName: input.buyerName?.trim() || null,
      buyerPhone: input.buyerPhone?.trim() || null,
      braceletCode: input.braceletCode?.trim() || null,
      certNo: input.certNo?.trim() || null,
      createdBy: input.createdBy ?? null,
    },
    include: { attachments: true },
  })
}

export async function updateAccountingRecord(id: string, data: Prisma.AccountingRecordUpdateInput) {
  return prisma.accountingRecord.update({
    where: { id },
    data,
    include: { attachments: true, financeAlerts: true },
  })
}

export async function sumByType(filter: AccountingRecordFilter, recordType: string) {
  const agg = await prisma.accountingRecord.aggregate({
    where: { ...buildWhere(filter), recordType },
    _sum: { amount: true },
    _count: true,
  })
  return { total: agg._sum.amount ?? 0, count: agg._count }
}

export async function countByStatus(filter: AccountingRecordFilter, status: string) {
  return prisma.accountingRecord.count({
    where: { ...buildWhere(filter), customerPaymentStatus: status },
  })
}
