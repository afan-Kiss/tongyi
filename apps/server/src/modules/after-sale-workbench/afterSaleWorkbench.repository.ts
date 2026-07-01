import { prisma } from '../../lib/prisma'
import type { AfterSaleListQuery } from './afterSaleWorkbench.types'

const ACTIVE_STATUS_RE = /处理中|待商家|待买家|退款中|退货|审核|待处理/

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function needsAttention(status?: string | null): boolean {
  const s = String(status || '').trim()
  if (!s) return true
  return ACTIVE_STATUS_RE.test(s)
}

export async function getAfterSaleOverview() {
  const today = startOfToday()
  const [totalItems, pendingRows, refundRows, financePendingCount] = await Promise.all([
    prisma.qianfanRawAfterSale.count(),
    prisma.qianfanRawAfterSale.findMany({
      where: { handleStatus: 'pending' },
      select: { status: true, refundAmount: true, syncedAt: true },
    }),
    prisma.qianfanRawAfterSale.findMany({
      where: { refundAmount: { gt: 0 } },
      select: { refundAmount: true, handleStatus: true },
    }),
    prisma.orderFinanceAlert.count({ where: { status: 'pending', type: 'refund' } }),
  ])
  const pendingToday = pendingRows.filter((r) => r.syncedAt >= today && needsAttention(r.status)).length
  const pendingRefundAmount = pendingRows
    .filter((r) => needsAttention(r.status))
    .reduce((s, r) => s + (r.refundAmount || 0), 0)
  const refundCount = refundRows.length
  return {
    totalItems,
    pendingToday,
    refundCount,
    pendingRefundAmount,
    financePendingCount,
    hint:
      totalItems === 0
        ? '还没有同步到售后，去千帆数据里点立即同步。'
        : pendingToday > 0
          ? `今天有 ${pendingToday} 条售后建议优先跟进，退款类请同步确认财务。`
          : '售后数据已同步，可在列表中查看处理进度。',
  }
}

export async function listAfterSaleItems(query: AfterSaleListQuery) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where: Record<string, unknown> = {}
  if (query.shopId) where.shopId = query.shopId
  if (query.handleStatus) where.handleStatus = query.handleStatus
  const [items, total] = await Promise.all([
    prisma.qianfanRawAfterSale.findMany({
      where,
      orderBy: { syncedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { shop: true },
    }),
    prisma.qianfanRawAfterSale.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function listRefunds(query: AfterSaleListQuery) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where = {
    refundAmount: { gt: 0 },
    ...(query.shopId ? { shopId: query.shopId } : {}),
    ...(query.handleStatus ? { handleStatus: query.handleStatus } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.qianfanRawAfterSale.findMany({
      where,
      orderBy: { syncedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { shop: true },
    }),
    prisma.qianfanRawAfterSale.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function listPendingAfterSales(query: AfterSaleListQuery) {
  const rows = await prisma.qianfanRawAfterSale.findMany({
    where: { handleStatus: 'pending' },
    orderBy: { syncedAt: 'desc' },
    include: { shop: true },
  })
  const filtered = rows.filter((r) => needsAttention(r.status))
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  }
}

export async function markAfterSaleHandled(id: string, note?: string) {
  const row = await prisma.qianfanRawAfterSale.update({
    where: { id },
    data: { handleStatus: 'handled', handledAt: new Date(), note: note?.trim() || null },
  })
  if (row.orderNo) {
    await prisma.orderFinanceAlert.updateMany({
      where: { orderNo: row.orderNo, status: 'pending', type: 'refund' },
      data: { status: 'handled', handledAt: new Date() },
    })
  }
  return row
}

export async function markAfterSaleIgnored(id: string, note?: string) {
  return prisma.qianfanRawAfterSale.update({
    where: { id },
    data: { handleStatus: 'ignored', handledAt: new Date(), note: note?.trim() || null },
  })
}

export async function getFinanceAlertsForOrder(orderNo?: string | null) {
  if (!orderNo) return []
  return prisma.orderFinanceAlert.findMany({
    where: { orderNo },
    orderBy: { createdAt: 'desc' },
  })
}

export { needsAttention }
