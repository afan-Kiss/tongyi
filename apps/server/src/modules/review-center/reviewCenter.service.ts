import {
  getReviewOverview,
  getReviewStats,
  listNegativeReviews,
  listPendingReplies,
  listReviews,
  markReviewHandled,
  markReviewIgnored,
} from './reviewCenter.repository'
import { presentReview } from './reviewCenter.presenter'

export async function fetchReviewOverview() {
  return getReviewOverview()
}

export async function fetchReviews(query: Parameters<typeof listReviews>[0]) {
  const data = await listReviews(query)
  return { ...data, items: data.items.map(presentReview) }
}

export async function fetchPendingReplies(query: Parameters<typeof listPendingReplies>[0]) {
  const data = await listPendingReplies(query)
  return { ...data, items: data.items.map(presentReview) }
}

export async function fetchNegativeReviews(query: Parameters<typeof listNegativeReviews>[0]) {
  const data = await listNegativeReviews(query)
  return { ...data, items: data.items.map(presentReview) }
}

export async function fetchReviewStats() {
  return getReviewStats()
}

export async function handleReview(id: string, note?: string) {
  const row = await markReviewHandled(id, note)
  return presentReview(row)
}

export async function ignoreReview(id: string, note?: string) {
  const row = await markReviewIgnored(id, note)
  return presentReview(row)
}
