import { prisma } from '../../lib/prisma'
import { LOW_SCORE_THRESHOLD, type HandleStatus, type ReviewListQuery } from './reviewCenter.types'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function isPendingReply(replyStatus?: string | null): boolean {
  const s = String(replyStatus || '').trim()
  if (!s) return true
  return /未回|待回|未回复|待回复|no/i.test(s) && !/已回|已回复/.test(s)
}

function isNegativeScore(score?: number | null): boolean {
  if (score == null || Number.isNaN(score)) return false
  return score <= LOW_SCORE_THRESHOLD
}

export async function getReviewOverview() {
  const today = startOfToday()
  const [totalReviews, reviewsToday, allPendingReply, negativeCount, goodCount] = await Promise.all([
    prisma.qianfanRawReview.count(),
    prisma.qianfanRawReview.count({ where: { syncedAt: { gte: today } } }),
    prisma.qianfanRawReview.findMany({
      where: { handleStatus: 'pending' },
      select: { replyStatus: true },
    }),
    prisma.qianfanRawReview.count({
      where: { handleStatus: 'pending', score: { lte: LOW_SCORE_THRESHOLD } },
    }),
    prisma.qianfanRawReview.count({ where: { score: { gte: 4 } } }),
  ])
  const pendingReplies = allPendingReply.filter((r) => isPendingReply(r.replyStatus)).length
  const goodRate = totalReviews > 0 ? Math.round((goodCount / totalReviews) * 1000) / 10 : 0
  return {
    totalReviews,
    reviewsToday,
    pendingReplies,
    negativeCount,
    goodRate,
    hint:
      totalReviews === 0
        ? '还没有同步到评价，去千帆数据里点立即同步。'
        : pendingReplies > 0
          ? `有 ${pendingReplies} 条评价待回复，建议优先处理低分评价。`
          : '评价数据已同步，可查看好评与低分提醒。',
  }
}

export async function listReviews(query: ReviewListQuery) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where: Record<string, unknown> = {}
  if (query.shopId) where.shopId = query.shopId
  if (query.handleStatus) where.handleStatus = query.handleStatus
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

export async function listPendingReplies(query: ReviewListQuery) {
  const rows = await prisma.qianfanRawReview.findMany({
    where: { handleStatus: 'pending' },
    orderBy: { reviewTime: 'desc' },
    include: { shop: true },
  })
  const filtered = rows.filter((r) => isPendingReply(r.replyStatus))
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

export async function listNegativeReviews(query: ReviewListQuery) {
  const page = Math.max(1, query.page || 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize || 30))
  const where = {
    handleStatus: 'pending' as HandleStatus,
    score: { lte: LOW_SCORE_THRESHOLD },
    ...(query.shopId ? { shopId: query.shopId } : {}),
  }
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

export async function getReviewStats() {
  const rows = await prisma.qianfanRawReview.findMany({
    select: { score: true, handleStatus: true, replyStatus: true },
  })
  const byScoreMap = new Map<number, number>()
  let pendingReplies = 0
  let negative = 0
  let handled = 0
  let ignored = 0
  for (const r of rows) {
    const score = Math.round(Number(r.score || 0))
    if (score > 0) byScoreMap.set(score, (byScoreMap.get(score) || 0) + 1)
    if (r.handleStatus === 'handled') handled += 1
    else if (r.handleStatus === 'ignored') ignored += 1
    else {
      if (isPendingReply(r.replyStatus)) pendingReplies += 1
      if (isNegativeScore(r.score)) negative += 1
    }
  }
  return {
    total: rows.length,
    byScore: [...byScoreMap.entries()]
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => b.score - a.score),
    pendingReplies,
    negative,
    handled,
    ignored,
  }
}

export async function markReviewHandled(id: string, note?: string) {
  return prisma.qianfanRawReview.update({
    where: { id },
    data: { handleStatus: 'handled', handledAt: new Date(), note: note?.trim() || null },
  })
}

export async function markReviewIgnored(id: string, note?: string) {
  return prisma.qianfanRawReview.update({
    where: { id },
    data: { handleStatus: 'ignored', handledAt: new Date(), note: note?.trim() || null },
  })
}

export { isNegativeScore, isPendingReply }
