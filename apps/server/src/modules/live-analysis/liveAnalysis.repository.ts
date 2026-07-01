import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { LiveAnalysisPeriodFilter, LiveSessionFilter } from './liveAnalysis.types'

function parseDateRange(filter: LiveAnalysisPeriodFilter) {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (filter.period === 'today') {
    const s = fmt(now)
    return { start: new Date(`${s}T00:00:00.000`), end: new Date(`${s}T23:59:59.999`), startDate: s, endDate: s, period: 'today' }
  }
  if (filter.period === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now)
    mon.setDate(now.getDate() - day + 1)
    return { start: new Date(`${fmt(mon)}T00:00:00.000`), end: new Date(`${fmt(now)}T23:59:59.999`), startDate: fmt(mon), endDate: fmt(now), period: 'week' }
  }
  if (filter.period === 'month') {
    const mon = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: mon, end: new Date(`${fmt(now)}T23:59:59.999`), startDate: fmt(mon), endDate: fmt(now), period: 'month' }
  }
  const startDate = filter.startDate || fmt(now)
  const endDate = filter.endDate || startDate
  return {
    start: new Date(`${startDate}T00:00:00.000`),
    end: new Date(`${endDate}T23:59:59.999`),
    startDate,
    endDate,
    period: filter.period || 'custom',
  }
}

function sessionWhere(filter: LiveAnalysisPeriodFilter): Prisma.LiveSessionWhereInput {
  const range = parseDateRange(filter)
  return { startedAt: { gte: range.start, lte: range.end } }
}

export { parseDateRange, sessionWhere }

export async function listSessions(filter: LiveSessionFilter) {
  const page = Math.max(1, filter.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20))
  const where: Prisma.LiveSessionWhereInput = { ...sessionWhere(filter) }
  if (filter.anchorName) where.anchorName = { contains: filter.anchorName }
  const [items, total] = await Promise.all([
    prisma.liveSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { anchorProfile: true },
    }),
    prisma.liveSession.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getSessionById(id: string) {
  return prisma.liveSession.findUnique({
    where: { id },
    include: { anchorProfile: true, orders: { orderBy: { paidAt: 'desc' } } },
  })
}

export async function aggregateSessions(filter: LiveAnalysisPeriodFilter) {
  const where = sessionWhere(filter)
  const agg = await prisma.liveSession.aggregate({
    where,
    _sum: {
      grossSalesAmount: true,
      validSalesAmount: true,
      orderCount: true,
      refundAmount: true,
      refundCount: true,
      afterSaleAmount: true,
    },
    _count: true,
  })
  const anchors = await prisma.liveSession.groupBy({
    by: ['anchorName'],
    where,
  })
  return {
    grossSalesAmount: agg._sum.grossSalesAmount ?? 0,
    validSalesAmount: agg._sum.validSalesAmount ?? 0,
    orderCount: agg._sum.orderCount ?? 0,
    refundAmount: agg._sum.refundAmount ?? 0,
    refundCount: agg._sum.refundCount ?? 0,
    afterSaleAmount: agg._sum.afterSaleAmount ?? 0,
    sessionCount: agg._count,
    anchorCount: anchors.length,
  }
}

export async function listRefundOrders(filter: LiveAnalysisPeriodFilter, limit = 100) {
  const range = parseDateRange(filter)
  return prisma.liveOrder.findMany({
    where: {
      refundAmount: { gt: 0 },
      session: { startedAt: { gte: range.start, lte: range.end } },
    },
    include: { session: true },
    orderBy: { refundAmount: 'desc' },
    take: limit,
  })
}

export async function listOrdersForProducts(filter: LiveAnalysisPeriodFilter) {
  const range = parseDateRange(filter)
  return prisma.liveOrder.findMany({
    where: {
      productName: { not: null },
      session: { startedAt: { gte: range.start, lte: range.end } },
    },
    select: {
      productName: true,
      amount: true,
      validAmount: true,
      refundAmount: true,
    },
  })
}

export async function sessionsForRanking(filter: LiveAnalysisPeriodFilter) {
  const where = sessionWhere(filter)
  return prisma.liveSession.findMany({ where })
}

export async function upsertAnchorProfile(name: string, displayName?: string) {
  return prisma.anchorProfile.upsert({
    where: { name },
    create: { name, displayName: displayName || name },
    update: { displayName: displayName || undefined },
  })
}

export async function createImportBatch(data: { source: string; filename?: string }) {
  return prisma.liveImportBatch.create({
    data: { source: data.source, filename: data.filename, status: 'processing' },
  })
}

export async function finishImportBatch(
  id: string,
  data: { status: string; importedCount?: number; errorMessage?: string },
) {
  return prisma.liveImportBatch.update({
    where: { id },
    data: {
      status: data.status,
      importedCount: data.importedCount ?? 0,
      errorMessage: data.errorMessage ?? null,
      finishedAt: new Date(),
    },
  })
}

export async function listImportBatches(limit = 20) {
  return prisma.liveImportBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function recalcSessionTotals(sessionId: string) {
  const orders = await prisma.liveOrder.findMany({ where: { sessionId } })
  const grossSalesAmount = orders.reduce((s, o) => s + o.amount, 0)
  const validSalesAmount = orders.reduce((s, o) => s + o.validAmount, 0)
  const refundAmount = orders.reduce((s, o) => s + o.refundAmount, 0)
  const refundCount = orders.filter((o) => o.refundAmount > 0).length
  const afterSaleAmount = orders
    .filter((o) => o.afterSaleStatus && !/无售后|未申请/.test(o.afterSaleStatus))
    .reduce((s, o) => s + o.refundAmount, 0)
  return prisma.liveSession.update({
    where: { id: sessionId },
    data: {
      grossSalesAmount,
      validSalesAmount,
      orderCount: orders.length,
      refundAmount,
      refundCount,
      afterSaleAmount,
    },
  })
}
