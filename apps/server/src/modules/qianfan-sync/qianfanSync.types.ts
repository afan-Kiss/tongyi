export type QianfanSyncType =
  | 'orders'
  | 'after_sales'
  | 'live'
  | 'reviews'
  | 'shop_score'
  | 'all'

export type QianfanSyncJobStatus = 'pending' | 'running' | 'success' | 'failed' | 'partial'

export type QianfanCookieStatus = 'ok' | 'missing' | 'expired' | 'unknown'

export interface OutboundXhsAccount {
  name: string
  cookie: string
  enabled: boolean
  isDefault?: boolean
}

export interface QianfanApiError {
  code: string
  message: string
  httpStatus?: number
  retryable?: boolean
}

export interface QianfanApiResult<T> {
  ok: boolean
  data?: T
  error?: QianfanApiError
}

export interface SyncCounters {
  inserted: number
  updated: number
  skipped: number
  failed: number
}

export interface SyncTypeResult {
  syncType: QianfanSyncType
  ok: boolean
  message: string
  counters: SyncCounters
  error?: string
}

export interface ShopSyncResult {
  shopId: string
  shopName: string
  jobId: string
  status: QianfanSyncJobStatus
  message: string
  results: SyncTypeResult[]
}

export interface NormalizedOrder {
  orderNo: string
  externalOrderId?: string
  buyerName?: string
  buyerPhoneMasked?: string
  productTitle?: string
  skuTitle?: string
  payAmount: number
  validAmount: number
  refundAmount: number
  orderStatus?: string
  afterSaleStatus?: string
  paidAt?: Date | null
  createdAtFromPlatform?: Date | null
  anchorName?: string
  liveSessionNo?: string
  raw: Record<string, unknown>
}

export interface NormalizedAfterSale {
  orderNo?: string
  afterSaleNo: string
  afterSaleType?: string
  status?: string
  refundAmount: number
  reason?: string
  createdAtFromPlatform?: Date | null
  updatedAtFromPlatform?: Date | null
  raw: Record<string, unknown>
}

export interface NormalizedLiveSession {
  sessionNo: string
  title?: string
  anchorName?: string
  startedAt?: Date | null
  endedAt?: Date | null
  grossSalesAmount: number
  validSalesAmount: number
  orderCount: number
  refundAmount: number
  raw: Record<string, unknown>
}

export interface NormalizedReview {
  orderNo?: string
  reviewId: string
  buyerName?: string
  score?: number
  content?: string
  reviewTime?: Date | null
  replyStatus?: string
  raw: Record<string, unknown>
}

export interface NormalizedShopScore {
  score?: number
  serviceScore?: number
  logisticsScore?: number
  productScore?: number
  reviewCount?: number
  raw: Record<string, unknown>
}
