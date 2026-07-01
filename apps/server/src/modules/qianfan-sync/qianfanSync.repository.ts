import { prisma } from '../../lib/prisma'
import { loadOutboundAccounts, probeCookieStatus } from './qianfanSync.accounts'
import type { QianfanSyncJobStatus, QianfanSyncType, SyncCounters } from './qianfanSync.types'
import type {
  NormalizedAfterSale,
  NormalizedLiveSession,
  NormalizedOrder,
  NormalizedReview,
  NormalizedShopScore,
} from './qianfanSync.types'

export async function syncShopAccountsFromConfig() {
  const accounts = loadOutboundAccounts(true)
  const results = []
  for (const acc of accounts) {
    const cookieStatus = probeCookieStatus(acc.cookie)
    const row = await prisma.qianfanShopAccount.upsert({
      where: { shopName: acc.name },
      create: {
        shopName: acc.name,
        shopTitle: acc.name,
        platform: 'xiaohongshu',
        status: 'active',
        cookieStatus,
        lastCookieAt: cookieStatus === 'ok' ? new Date() : undefined,
      },
      update: {
        shopTitle: acc.name,
        status: 'active',
        cookieStatus,
        lastCookieAt: cookieStatus === 'ok' ? new Date() : undefined,
      },
    })
    results.push(row)
  }
  return results
}

export async function listShops() {
  await syncShopAccountsFromConfig()
  return prisma.qianfanShopAccount.findMany({ orderBy: { shopName: 'asc' } })
}

export async function getShopById(id: string) {
  return prisma.qianfanShopAccount.findUnique({ where: { id } })
}

export function emptyCounters(): SyncCounters {
  return { inserted: 0, updated: 0, skipped: 0, failed: 0 }
}

export async function createSyncJob(shopId: string, syncType: QianfanSyncType) {
  return prisma.qianfanSyncJob.create({
    data: { shopId, syncType, status: 'running', startedAt: new Date() },
  })
}

export async function finishSyncJob(
  jobId: string,
  status: QianfanSyncJobStatus,
  result: Record<string, unknown>,
  errorMessage?: string,
) {
  return prisma.qianfanSyncJob.update({
    where: { id: jobId },
    data: {
      status,
      finishedAt: new Date(),
      resultJson: JSON.stringify(result),
      errorMessage: errorMessage || null,
    },
  })
}

export async function appendSyncLog(input: {
  shopId?: string
  syncJobId?: string
  level?: string
  message: string
  detail?: Record<string, unknown>
}) {
  return prisma.qianfanSyncLog.create({
    data: {
      shopId: input.shopId,
      syncJobId: input.syncJobId,
      level: input.level || 'info',
      message: input.message,
      detailJson: JSON.stringify(input.detail || {}),
    },
  })
}

async function upsertWithCounter<T>(
  counters: SyncCounters,
  exists: boolean,
  write: () => Promise<T>,
): Promise<T> {
  try {
    const row = await write()
    if (exists) counters.updated += 1
    else counters.inserted += 1
    return row
  } catch {
    counters.failed += 1
    throw new Error('写入失败')
  }
}

export async function upsertRawOrders(shopId: string, orders: NormalizedOrder[]) {
  const counters = emptyCounters()
  for (const order of orders) {
    const existing = await prisma.qianfanRawOrder.findUnique({
      where: { shopId_orderNo: { shopId, orderNo: order.orderNo } },
    })
    await upsertWithCounter(counters, Boolean(existing), () =>
      prisma.qianfanRawOrder.upsert({
        where: { shopId_orderNo: { shopId, orderNo: order.orderNo } },
        create: {
          shopId,
          orderNo: order.orderNo,
          externalOrderId: order.externalOrderId,
          buyerName: order.buyerName,
          buyerPhoneMasked: order.buyerPhoneMasked,
          productTitle: order.productTitle,
          skuTitle: order.skuTitle,
          payAmount: order.payAmount,
          validAmount: order.validAmount,
          refundAmount: order.refundAmount,
          orderStatus: order.orderStatus,
          afterSaleStatus: order.afterSaleStatus,
          paidAt: order.paidAt,
          createdAtFromPlatform: order.createdAtFromPlatform,
          rawJson: JSON.stringify(order.raw),
          syncedAt: new Date(),
        },
        update: {
          externalOrderId: order.externalOrderId,
          buyerName: order.buyerName,
          buyerPhoneMasked: order.buyerPhoneMasked,
          productTitle: order.productTitle,
          skuTitle: order.skuTitle,
          payAmount: order.payAmount,
          validAmount: order.validAmount,
          refundAmount: order.refundAmount,
          orderStatus: order.orderStatus,
          afterSaleStatus: order.afterSaleStatus,
          paidAt: order.paidAt,
          createdAtFromPlatform: order.createdAtFromPlatform,
          rawJson: JSON.stringify(order.raw),
          syncedAt: new Date(),
        },
      }),
    )
  }
  return counters
}

export async function upsertRawAfterSales(shopId: string, rows: NormalizedAfterSale[]) {
  const counters = emptyCounters()
  for (const row of rows) {
    const existing = await prisma.qianfanRawAfterSale.findUnique({
      where: { shopId_afterSaleNo: { shopId, afterSaleNo: row.afterSaleNo } },
    })
    await upsertWithCounter(counters, Boolean(existing), () =>
      prisma.qianfanRawAfterSale.upsert({
        where: { shopId_afterSaleNo: { shopId, afterSaleNo: row.afterSaleNo } },
        create: {
          shopId,
          orderNo: row.orderNo,
          afterSaleNo: row.afterSaleNo,
          afterSaleType: row.afterSaleType,
          status: row.status,
          refundAmount: row.refundAmount,
          reason: row.reason,
          createdAtFromPlatform: row.createdAtFromPlatform,
          updatedAtFromPlatform: row.updatedAtFromPlatform,
          rawJson: JSON.stringify(row.raw),
          syncedAt: new Date(),
        },
        update: {
          orderNo: row.orderNo,
          afterSaleType: row.afterSaleType,
          status: row.status,
          refundAmount: row.refundAmount,
          reason: row.reason,
          createdAtFromPlatform: row.createdAtFromPlatform,
          updatedAtFromPlatform: row.updatedAtFromPlatform,
          rawJson: JSON.stringify(row.raw),
          syncedAt: new Date(),
        },
      }),
    )
  }
  return counters
}

export async function upsertRawLiveSessions(shopId: string, rows: NormalizedLiveSession[]) {
  const counters = emptyCounters()
  for (const row of rows) {
    const existing = await prisma.qianfanRawLiveSession.findUnique({
      where: { shopId_sessionNo: { shopId, sessionNo: row.sessionNo } },
    })
    await upsertWithCounter(counters, Boolean(existing), () =>
      prisma.qianfanRawLiveSession.upsert({
        where: { shopId_sessionNo: { shopId, sessionNo: row.sessionNo } },
        create: {
          shopId,
          sessionNo: row.sessionNo,
          title: row.title,
          anchorName: row.anchorName,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          grossSalesAmount: row.grossSalesAmount,
          validSalesAmount: row.validSalesAmount,
          orderCount: row.orderCount,
          refundAmount: row.refundAmount,
          rawJson: JSON.stringify(row.raw),
          syncedAt: new Date(),
        },
        update: {
          title: row.title,
          anchorName: row.anchorName,
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          grossSalesAmount: row.grossSalesAmount,
          validSalesAmount: row.validSalesAmount,
          orderCount: row.orderCount,
          refundAmount: row.refundAmount,
          rawJson: JSON.stringify(row.raw),
          syncedAt: new Date(),
        },
      }),
    )
  }
  return counters
}

export async function upsertRawReviews(shopId: string, rows: NormalizedReview[]) {
  const counters = emptyCounters()
  for (const row of rows) {
    const existing = await prisma.qianfanRawReview.findUnique({
      where: { shopId_reviewId: { shopId, reviewId: row.reviewId } },
    })
    await upsertWithCounter(counters, Boolean(existing), () =>
      prisma.qianfanRawReview.upsert({
        where: { shopId_reviewId: { shopId, reviewId: row.reviewId } },
        create: {
          shopId,
          orderNo: row.orderNo,
          reviewId: row.reviewId,
          buyerName: row.buyerName,
          score: row.score,
          content: row.content,
          reviewTime: row.reviewTime,
          replyStatus: row.replyStatus,
          rawJson: JSON.stringify(row.raw),
          syncedAt: new Date(),
        },
        update: {
          orderNo: row.orderNo,
          buyerName: row.buyerName,
          score: row.score,
          content: row.content,
          reviewTime: row.reviewTime,
          replyStatus: row.replyStatus,
          rawJson: JSON.stringify(row.raw),
          syncedAt: new Date(),
        },
      }),
    )
  }
  return counters
}

export async function saveShopScoreSnapshot(shopId: string, score: NormalizedShopScore) {
  return prisma.qianfanShopScoreSnapshot.create({
    data: {
      shopId,
      score: score.score,
      serviceScore: score.serviceScore,
      logisticsScore: score.logisticsScore,
      productScore: score.productScore,
      reviewCount: score.reviewCount,
      rawJson: JSON.stringify(score.raw),
    },
  })
}

export async function touchShopSync(shopId: string) {
  return prisma.qianfanShopAccount.update({
    where: { id: shopId },
    data: { lastSyncAt: new Date() },
  })
}

export async function listJobs(limit = 50) {
  return prisma.qianfanSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { shop: true },
  })
}

export async function getJob(id: string) {
  return prisma.qianfanSyncJob.findUnique({ where: { id }, include: { shop: true } })
}

export async function listLogs(query: {
  shopId?: string
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where = query.shopId ? { shopId: query.shopId } : {}
  const [items, total] = await Promise.all([
    prisma.qianfanSyncLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { shop: true },
    }),
    prisma.qianfanSyncLog.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function listRawOrders(query: {
  shopId?: string
  page?: number
  pageSize?: number
  q?: string
}) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where: Record<string, unknown> = {}
  if (query.shopId) where.shopId = query.shopId
  if (query.q?.trim()) {
    where.OR = [
      { orderNo: { contains: query.q.trim() } },
      { buyerName: { contains: query.q.trim() } },
      { productTitle: { contains: query.q.trim() } },
    ]
  }
  const [items, total] = await Promise.all([
    prisma.qianfanRawOrder.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { shop: true },
    }),
    prisma.qianfanRawOrder.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function listRawAfterSales(query: { shopId?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where = query.shopId ? { shopId: query.shopId } : {}
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

export async function listRawLiveSessions(query: { shopId?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where = query.shopId ? { shopId: query.shopId } : {}
  const [items, total] = await Promise.all([
    prisma.qianfanRawLiveSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { shop: true },
    }),
    prisma.qianfanRawLiveSession.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function listRawReviews(query: { shopId?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where = query.shopId ? { shopId: query.shopId } : {}
  const [items, total] = await Promise.all([
    prisma.qianfanRawReview.findMany({
      where,
      orderBy: { reviewTime: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { shop: true },
    }),
    prisma.qianfanRawReview.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function getOverviewStats() {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const [shops, ordersToday, afterSalesToday, reviewsToday, lastJob] = await Promise.all([
    prisma.qianfanShopAccount.count(),
    prisma.qianfanRawOrder.count({ where: { syncedAt: { gte: startOfDay } } }),
    prisma.qianfanRawAfterSale.count({ where: { syncedAt: { gte: startOfDay } } }),
    prisma.qianfanRawReview.count({ where: { syncedAt: { gte: startOfDay } } }),
    prisma.qianfanSyncJob.findFirst({ orderBy: { createdAt: 'desc' } }),
  ])
  return { shops, ordersToday, afterSalesToday, reviewsToday, lastJob }
}
