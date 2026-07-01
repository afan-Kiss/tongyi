import type {
  QianfanShopAccount,
  QianfanSyncJob,
  QianfanSyncLog,
  QianfanRawOrder,
  QianfanRawAfterSale,
  QianfanRawLiveSession,
  QianfanRawReview,
} from '@prisma/client'

function fmtTime(d?: Date | null): string | null {
  if (!d) return null
  return d.toISOString()
}

export function presentShop(row: QianfanShopAccount) {
  return {
    id: row.id,
    shopName: row.shopName,
    shopTitle: row.shopTitle,
    cookieStatus: row.cookieStatus,
    cookieHint:
      row.cookieStatus === 'ok'
        ? 'Cookie 可用'
        : row.cookieStatus === 'missing'
          ? 'Cookie 不可用，请先打开千帆客服台或重新采集'
          : row.cookieStatus === 'expired'
            ? 'Cookie 可能已过期，请重新采集'
            : 'Cookie 状态未知',
    lastCookieAt: fmtTime(row.lastCookieAt),
    lastSyncAt: fmtTime(row.lastSyncAt),
    status: row.status,
  }
}

export function presentJob(row: QianfanSyncJob & { shop?: QianfanShopAccount | null }) {
  let result: Record<string, unknown> = {}
  try {
    result = JSON.parse(row.resultJson || '{}') as Record<string, unknown>
  } catch {
    result = {}
  }
  return {
    id: row.id,
    shopId: row.shopId,
    shopName: row.shop?.shopName,
    syncType: row.syncType,
    status: row.status,
    message: String(result.message || row.errorMessage || statusLabel(row.status)),
    startedAt: fmtTime(row.startedAt),
    finishedAt: fmtTime(row.finishedAt),
    result,
    errorMessage: row.errorMessage,
  }
}

function statusLabel(status: string): string {
  if (status === 'running') return '正在同步'
  if (status === 'success') return '同步完成'
  if (status === 'partial') return '部分同步成功'
  if (status === 'failed') return '同步失败'
  return '等待同步'
}

export function presentLog(row: QianfanSyncLog & { shop?: QianfanShopAccount | null }) {
  let detail: Record<string, unknown> = {}
  try {
    detail = JSON.parse(row.detailJson || '{}') as Record<string, unknown>
  } catch {
    detail = {}
  }
  return {
    id: row.id,
    shopId: row.shopId,
    shopName: row.shop?.shopName,
    syncJobId: row.syncJobId,
    level: row.level,
    message: row.message,
    detail,
    createdAt: fmtTime(row.createdAt),
  }
}

export function presentOrder(row: QianfanRawOrder & { shop?: QianfanShopAccount | null }) {
  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(row.rawJson || '{}') as Record<string, unknown>
  } catch {
    raw = {}
  }
  return {
    id: row.id,
    shopName: row.shop?.shopName,
    orderNo: row.orderNo,
    buyerName: row.buyerName,
    buyerPhoneMasked: row.buyerPhoneMasked,
    productTitle: row.productTitle,
    skuTitle: row.skuTitle,
    payAmount: row.payAmount,
    validAmount: row.validAmount,
    refundAmount: row.refundAmount,
    orderStatus: row.orderStatus,
    afterSaleStatus: row.afterSaleStatus,
    paidAt: fmtTime(row.paidAt),
    syncedAt: fmtTime(row.syncedAt),
    raw,
  }
}

export function presentAfterSale(row: QianfanRawAfterSale & { shop?: QianfanShopAccount | null }) {
  return {
    id: row.id,
    shopName: row.shop?.shopName,
    orderNo: row.orderNo,
    afterSaleNo: row.afterSaleNo,
    afterSaleType: row.afterSaleType,
    status: row.status,
    refundAmount: row.refundAmount,
    reason: row.reason,
    syncedAt: fmtTime(row.syncedAt),
  }
}

export function presentLiveSession(row: QianfanRawLiveSession & { shop?: QianfanShopAccount | null }) {
  return {
    id: row.id,
    shopName: row.shop?.shopName,
    sessionNo: row.sessionNo,
    title: row.title,
    anchorName: row.anchorName,
    startedAt: fmtTime(row.startedAt),
    endedAt: fmtTime(row.endedAt),
    grossSalesAmount: row.grossSalesAmount,
    validSalesAmount: row.validSalesAmount,
    orderCount: row.orderCount,
    refundAmount: row.refundAmount,
    syncedAt: fmtTime(row.syncedAt),
  }
}

export function presentReview(row: QianfanRawReview & { shop?: QianfanShopAccount | null }) {
  return {
    id: row.id,
    shopName: row.shop?.shopName,
    orderNo: row.orderNo,
    reviewId: row.reviewId,
    buyerName: row.buyerName,
    score: row.score,
    content: row.content,
    reviewTime: fmtTime(row.reviewTime),
    replyStatus: row.replyStatus,
    syncedAt: fmtTime(row.syncedAt),
  }
}

export function countersMessage(counters: { inserted: number; updated: number; failed: number }) {
  if (counters.inserted === 0 && counters.updated === 0 && counters.failed === 0) {
    return '没有拉到新数据，系统会保留上次数据'
  }
  return `同步完成，本次新增 ${counters.inserted} 条，更新 ${counters.updated} 条`
}
