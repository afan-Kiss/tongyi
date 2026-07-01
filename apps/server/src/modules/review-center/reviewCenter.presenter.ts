import type { QianfanRawReview } from '@prisma/client'
import { isNegativeScore } from './reviewCenter.repository'

export function presentReview(row: QianfanRawReview & { shop?: { shopName: string } | null }) {
  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(row.rawJson || '{}') as Record<string, unknown>
  } catch {
    raw = {}
  }
  const negative = isNegativeScore(row.score)
  const good = row.score != null && row.score >= 4
  return {
    id: row.id,
    shopName: row.shop?.shopName,
    orderNo: row.orderNo,
    reviewId: row.reviewId,
    buyerName: row.buyerName,
    score: row.score,
    content: row.content,
    reviewTime: row.reviewTime?.toISOString() || null,
    replyStatus: row.replyStatus,
    handleStatus: row.handleStatus,
    handledAt: row.handledAt?.toISOString() || null,
    note: row.note,
    syncedAt: row.syncedAt.toISOString(),
    raw,
    hint: negative
      ? '这条需要尽快处理，先安抚客户，再核对订单问题。'
      : good
        ? '这类话术/商品表现不错，可以继续放大。'
        : undefined,
  }
}
