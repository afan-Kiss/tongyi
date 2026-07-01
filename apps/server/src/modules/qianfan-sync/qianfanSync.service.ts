import { loadOutboundAccounts } from './qianfanSync.accounts'
import { fetchAfterSalePages } from './qianfanSync.afterSale'
import { aggregateLiveSessionsFromOrders, fetchLiveRoomPages } from './qianfanSync.live'
import {
  normalizeAfterSaleRow,
  normalizeLiveSessionRow,
  normalizeOrderRow,
  normalizeReviewRow,
  normalizeShopScore,
} from './qianfanSync.normalizer'
import { fetchRecentOrders } from './qianfanSync.order'
import { fetchReviewPages, fetchShopScore } from './qianfanSync.review'
import {
  appendSyncLog,
  createSyncJob,
  finishSyncJob,
  getOverviewStats,
  getShopById,
  listJobs,
  listLogs,
  listRawAfterSales,
  listRawLiveSessions,
  listRawOrders,
  listRawReviews,
  listShops,
  syncShopAccountsFromConfig,
  touchShopSync,
  upsertRawAfterSales,
  upsertRawLiveSessions,
  upsertRawOrders,
  upsertRawReviews,
  saveShopScoreSnapshot,
} from './qianfanSync.repository'
import {
  syncAfterSalesToOrders,
  syncLiveSessionsToBusiness,
  syncOrdersToLiveBusiness,
} from './qianfanSync.businessSync'
import { countersMessage, presentAfterSale, presentJob, presentLiveSession, presentLog, presentOrder, presentReview, presentShop } from './qianfanSync.presenter'
import type { QianfanSyncType, ShopSyncResult, SyncTypeResult, NormalizedLiveSession } from './qianfanSync.types'

function cookieForShop(shopName: string): string | null {
  const acc = loadOutboundAccounts(true).find((a) => a.name === shopName)
  return acc?.cookie || null
}

async function runSyncType(
  shopId: string,
  shopName: string,
  syncType: QianfanSyncType,
  jobId: string,
): Promise<SyncTypeResult> {
  const cookie = cookieForShop(shopName)
  if (!cookie) {
    const message = 'Cookie 不可用，请先打开千帆客服台或重新采集'
    await appendSyncLog({ shopId, syncJobId: jobId, level: 'error', message })
    return { syncType, ok: false, message, counters: { inserted: 0, updated: 0, skipped: 0, failed: 0 }, error: message }
  }

  try {
    if (syncType === 'orders') {
      await appendSyncLog({ shopId, syncJobId: jobId, message: '正在同步订单' })
      const res = await fetchRecentOrders(cookie)
      if (!res.ok || !res.data) {
        const message = res.error?.message || '订单同步失败'
        await appendSyncLog({ shopId, syncJobId: jobId, level: 'error', message })
        return { syncType, ok: false, message, counters: { inserted: 0, updated: 0, skipped: 0, failed: 0 }, error: message }
      }
      const normalized = res.data.items.map(normalizeOrderRow).filter((x): x is NonNullable<typeof x> => Boolean(x))
      const counters = await upsertRawOrders(shopId, normalized)
      await syncOrdersToLiveBusiness(shopName, normalized)
      const message = countersMessage(counters)
      await appendSyncLog({ shopId, syncJobId: jobId, message, detail: { ...counters } })
      return { syncType, ok: true, message, counters }
    }

    if (syncType === 'after_sales') {
      await appendSyncLog({ shopId, syncJobId: jobId, message: '正在同步售后' })
      const res = await fetchAfterSalePages(cookie)
      if (!res.ok || !res.data) {
        const message = res.error?.message || '售后同步失败'
        await appendSyncLog({ shopId, syncJobId: jobId, level: 'error', message })
        return { syncType, ok: false, message, counters: { inserted: 0, updated: 0, skipped: 0, failed: 0 }, error: message }
      }
      const normalized = res.data.items.map(normalizeAfterSaleRow).filter((x): x is NonNullable<typeof x> => Boolean(x))
      const counters = await upsertRawAfterSales(shopId, normalized)
      await syncAfterSalesToOrders(normalized)
      const message = countersMessage(counters)
      await appendSyncLog({ shopId, syncJobId: jobId, message, detail: { ...counters } })
      return { syncType, ok: true, message, counters }
    }

    if (syncType === 'live') {
      await appendSyncLog({ shopId, syncJobId: jobId, message: '正在同步直播场次' })
      const res = await fetchLiveRoomPages(cookie)
      let normalized: NormalizedLiveSession[] = []
      if (res.ok && res.data) {
        normalized = res.data.items.map(normalizeLiveSessionRow).filter((x): x is NonNullable<typeof x> => Boolean(x))
      }
      if (!normalized.length) {
        const orderRes = await fetchRecentOrders(cookie, 7)
        if (orderRes.ok && orderRes.data) {
          const orders = orderRes.data.items.map(normalizeOrderRow).filter((x): x is NonNullable<typeof x> => Boolean(x))
          normalized = aggregateLiveSessionsFromOrders(orders)
        }
      }
      const counters = await upsertRawLiveSessions(shopId, normalized)
      await syncLiveSessionsToBusiness(normalized)
      const message = normalized.length ? countersMessage(counters) : '直播接口暂无数据，已从订单聚合场次（如有）'
      await appendSyncLog({ shopId, syncJobId: jobId, message, detail: { ...counters } })
      return { syncType, ok: true, message, counters }
    }

    if (syncType === 'reviews') {
      await appendSyncLog({ shopId, syncJobId: jobId, message: '正在同步评价' })
      const res = await fetchReviewPages(cookie)
      if (!res.ok || !res.data) {
        const message = res.error?.message || '评价同步失败'
        await appendSyncLog({ shopId, syncJobId: jobId, level: 'error', message })
        return { syncType, ok: false, message, counters: { inserted: 0, updated: 0, skipped: 0, failed: 0 }, error: message }
      }
      const normalized = res.data.items.map(normalizeReviewRow).filter((x): x is NonNullable<typeof x> => Boolean(x))
      const counters = await upsertRawReviews(shopId, normalized)
      const message = countersMessage(counters)
      await appendSyncLog({ shopId, syncJobId: jobId, message, detail: { ...counters } })
      return { syncType, ok: true, message, counters }
    }

    if (syncType === 'shop_score') {
      await appendSyncLog({ shopId, syncJobId: jobId, message: '正在同步店铺评分' })
      const res = await fetchShopScore(cookie)
      if (!res.ok || !res.data) {
        const message = res.error?.message || '店铺评分同步失败'
        await appendSyncLog({ shopId, syncJobId: jobId, level: 'error', message })
        return { syncType, ok: false, message, counters: { inserted: 0, updated: 0, skipped: 0, failed: 0 }, error: message }
      }
      const score = normalizeShopScore(res.data)
      await saveShopScoreSnapshot(shopId, score)
      const message = '店铺评分已更新'
      await appendSyncLog({ shopId, syncJobId: jobId, message })
      return { syncType, ok: true, message, counters: { inserted: 1, updated: 0, skipped: 0, failed: 0 } }
    }

    return {
      syncType,
      ok: false,
      message: '未知同步类型',
      counters: { inserted: 0, updated: 0, skipped: 0, failed: 0 },
      error: 'unknown',
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : '同步异常'
    await appendSyncLog({ shopId, syncJobId: jobId, level: 'error', message })
    return { syncType, ok: false, message, counters: { inserted: 0, updated: 0, skipped: 0, failed: 0 }, error: message }
  }
}

const ALL_TYPES: QianfanSyncType[] = ['orders', 'after_sales', 'live', 'reviews', 'shop_score']

export async function runShopSync(shopId: string, syncType: QianfanSyncType): Promise<ShopSyncResult> {
  const shop = await getShopById(shopId)
  if (!shop) throw new Error('店铺不存在')

  const types = syncType === 'all' ? ALL_TYPES : [syncType]
  const job = await createSyncJob(shopId, syncType)
  const results: SyncTypeResult[] = []

  for (const type of types) {
    results.push(await runSyncType(shopId, shop.shopName, type, job.id))
  }

  const okCount = results.filter((r) => r.ok).length
  const status = okCount === results.length ? 'success' : okCount > 0 ? 'partial' : 'failed'
  const message =
    status === 'success'
      ? '全部同步完成'
      : status === 'partial'
        ? '部分同步成功，失败项请查看日志'
        : '同步失败，请检查 Cookie 或稍后重试'

  await finishSyncJob(job.id, status, { message, results })
  await touchShopSync(shopId)

  return { shopId, shopName: shop.shopName, jobId: job.id, status, message, results }
}

export async function runAllShopsSync(syncType: QianfanSyncType) {
  const shops = await listShops()
  const out: ShopSyncResult[] = []
  for (const shop of shops) {
    if (shop.status !== 'active') continue
    out.push(await runShopSync(shop.id, syncType))
  }
  return out
}

export async function getSyncOverview() {
  await syncShopAccountsFromConfig()
  const [shops, stats] = await Promise.all([listShops(), getOverviewStats()])
  return {
    shops: shops.map(presentShop),
    stats: {
      shopCount: stats.shops,
      ordersToday: stats.ordersToday,
      afterSalesToday: stats.afterSalesToday,
      reviewsToday: stats.reviewsToday,
      lastSyncAt: stats.lastJob?.finishedAt?.toISOString() || stats.lastJob?.createdAt?.toISOString() || null,
    },
    hint: shops.some((s) => s.cookieStatus !== 'ok')
      ? '部分店铺 Cookie 不可用，同步前请先采集 Cookie'
      : '可点击立即同步，从千帆后台拉取最新数据',
  }
}

export async function getShopsView() {
  const shops = await listShops()
  return shops.map(presentShop)
}

export async function patchShop(id: string, body: { status?: string; shopTitle?: string }) {
  const { prisma } = await import('../../lib/prisma')
  return prisma.qianfanShopAccount.update({
    where: { id },
    data: {
      status: body.status,
      shopTitle: body.shopTitle,
    },
  }).then(presentShop)
}

export async function getJobsView(limit?: number) {
  const rows = await listJobs(limit)
  return rows.map(presentJob)
}

export async function getJobView(id: string) {
  const { getJob } = await import('./qianfanSync.repository')
  const row = await getJob(id)
  return row ? presentJob(row) : null
}

export async function getLogsView(query: { shopId?: string; page?: number; pageSize?: number }) {
  const data = await listLogs(query)
  return { ...data, items: data.items.map(presentLog) }
}

export async function getOrdersView(query: { shopId?: string; page?: number; pageSize?: number; q?: string }) {
  const data = await listRawOrders(query)
  return { ...data, items: data.items.map(presentOrder) }
}

export async function getAfterSalesView(query: { shopId?: string; page?: number; pageSize?: number }) {
  const data = await listRawAfterSales(query)
  return { ...data, items: data.items.map(presentAfterSale) }
}

export async function getLiveSessionsView(query: { shopId?: string; page?: number; pageSize?: number }) {
  const data = await listRawLiveSessions(query)
  return { ...data, items: data.items.map(presentLiveSession) }
}

export async function getReviewsView(query: { shopId?: string; page?: number; pageSize?: number }) {
  const data = await listRawReviews(query)
  return { ...data, items: data.items.map(presentReview) }
}

export async function createShop(body: { shopName: string; shopTitle?: string }) {
  const { prisma } = await import('../../lib/prisma')
  const row = await prisma.qianfanShopAccount.create({
    data: {
      shopName: body.shopName,
      shopTitle: body.shopTitle || body.shopName,
      platform: 'xiaohongshu',
    },
  })
  return presentShop(row)
}
