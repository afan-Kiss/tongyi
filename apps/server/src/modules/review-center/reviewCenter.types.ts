export type HandleStatus = 'pending' | 'handled' | 'ignored'

export const LOW_SCORE_THRESHOLD = 3

export interface ReviewListQuery {
  shopId?: string
  page?: number
  pageSize?: number
  handleStatus?: HandleStatus
}

export interface ReviewOverview {
  totalReviews: number
  reviewsToday: number
  pendingReplies: number
  negativeCount: number
  goodRate: number
  hint: string
}

export interface ReviewStats {
  total: number
  byScore: Array<{ score: number; count: number }>
  pendingReplies: number
  negative: number
  handled: number
  ignored: number
}
