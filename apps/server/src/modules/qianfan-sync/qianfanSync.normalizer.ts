import {
  buildValidRevenueInputFromRow,
  centToYuan,
  resolveValidRevenueAmountCent,
} from '../live-analysis/liveAnalysis-valid-revenue'
import type {
  NormalizedAfterSale,
  NormalizedLiveSession,
  NormalizedOrder,
  NormalizedReview,
  NormalizedShopScore,
} from './qianfanSync.types'

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseTs(val: unknown): Date | null {
  if (val == null || val === '') return null
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    const ms = val > 1e12 ? val : val * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(String(val))
  return Number.isNaN(d.getTime()) ? null : d
}

function orderNoFrom(raw: Record<string, unknown>): string {
  const fields = [
    raw.orderSn,
    raw.order_sn,
    raw.packageId,
    raw.package_id,
    raw.orderId,
    raw.order_id,
    raw.delivery_package_id,
  ]
  for (const f of fields) {
    const s = str(f)
    if (s) return s
  }
  return ''
}

function pickSkus(raw: Record<string, unknown>) {
  const skus = Array.isArray(raw.skus) ? raw.skus : []
  return (skus[0] || {}) as Record<string, unknown>
}

function maskPhone(phone: string): string {
  const p = phone.replace(/\D/g, '')
  if (p.length < 7) return phone
  return `${p.slice(0, 3)}****${p.slice(-4)}`
}

export function normalizeOrderRow(rawInput: unknown): NormalizedOrder | null {
  if (!rawInput || typeof rawInput !== 'object') return null
  const raw = rawInput as Record<string, unknown>
  const orderNo = orderNoFrom(raw)
  if (!orderNo) return null

  const sku = pickSkus(raw)
  const payAmount = num(raw.pay_amount ?? raw.payAmount ?? raw.total_pay_amount ?? raw.totalPayAmount)
  const refundAmount = num(raw.refund_amount ?? raw.refundAmount ?? raw.return_amount)
  const orderStatus = str(raw.status_desc ?? raw.order_status_desc ?? raw.status ?? raw.orderStatus)
  const afterSaleStatus = str(
    raw.after_sale_status_desc ?? raw.afterSaleStatusDesc ?? raw.after_sale_status ?? raw.afterSaleStatus,
  )

  const validInput = buildValidRevenueInputFromRow({
    amount: payAmount,
    refundAmount,
    orderStatus,
    afterSaleStatus,
  })
  const validCent = resolveValidRevenueAmountCent(validInput)

  const liveInfo = (raw.live_info || raw.liveInfo || {}) as Record<string, unknown>
  const anchorName = str(liveInfo.anchor_name ?? liveInfo.anchorName ?? raw.anchor_name ?? raw.anchorName)
  const liveSessionNo = str(liveInfo.room_id ?? liveInfo.roomId ?? raw.live_room_id ?? raw.liveRoomId)

  const ui = (raw.userInfo || raw.user_info || raw.buyer_info || {}) as Record<string, unknown>
  const buyerName = str(ui.nickName ?? ui.nickname ?? ui.nick_name ?? raw.nick_name ?? raw.buyerNick)
  const phone = str(ui.phone ?? ui.mobile ?? raw.receiver_phone ?? raw.receiverPhone)

  return {
    orderNo,
    externalOrderId: str(raw.order_id ?? raw.orderId) || undefined,
    buyerName: buyerName || undefined,
    buyerPhoneMasked: phone ? maskPhone(phone) : undefined,
    productTitle: str(sku.name_without_v ?? sku.sku_name ?? sku.name ?? raw.product_title) || undefined,
    skuTitle: str(sku.sku_name ?? sku.spec) || undefined,
    payAmount,
    validAmount: centToYuan(validCent),
    refundAmount,
    orderStatus: orderStatus || undefined,
    afterSaleStatus: afterSaleStatus || undefined,
    paidAt: parseTs(raw.ordered_at ?? raw.orderedAt ?? raw.pay_time ?? raw.payTime),
    createdAtFromPlatform: parseTs(raw.created_at ?? raw.createdAt),
    anchorName: anchorName || undefined,
    liveSessionNo: liveSessionNo || undefined,
    raw,
  }
}

export function normalizeAfterSaleRow(rawInput: unknown): NormalizedAfterSale | null {
  if (!rawInput || typeof rawInput !== 'object') return null
  const raw = rawInput as Record<string, unknown>
  const afterSaleNo = str(raw.returns_id ?? raw.returnsId ?? raw.after_sale_no ?? raw.afterSaleNo)
  if (!afterSaleNo) return null
  const sku = pickSkus(raw)
  return {
    orderNo: str(raw.order_id ?? raw.orderId ?? raw.delivery_package_id) || undefined,
    afterSaleNo,
    afterSaleType: str(raw.returns_type_desc ?? raw.returns_type ?? raw.type_desc) || undefined,
    status: str(raw.status_desc ?? raw.status ?? raw.returns_status_desc) || undefined,
    refundAmount: num(raw.applied_amount ?? raw.refund_amount ?? raw.pay_amount),
    reason: str(raw.reason_desc ?? raw.reason ?? raw.returns_reason) || undefined,
    createdAtFromPlatform: parseTs(raw.time ?? raw.created_at ?? raw.deadline_for_sort),
    updatedAtFromPlatform: parseTs(raw.updated_at ?? raw.update_time),
    raw: { ...raw, productTitle: str(sku.name_without_v ?? sku.sku_name) },
  }
}

export function normalizeLiveSessionRow(rawInput: unknown): NormalizedLiveSession | null {
  if (!rawInput || typeof rawInput !== 'object') return null
  const raw = rawInput as Record<string, unknown>
  const sessionNo = str(raw.room_id ?? raw.roomId ?? raw.live_id ?? raw.liveId ?? raw.session_no)
  if (!sessionNo) return null
  return {
    sessionNo,
    title: str(raw.title ?? raw.room_title ?? raw.live_title) || undefined,
    anchorName: str(raw.anchor_name ?? raw.anchorName ?? raw.host_name) || undefined,
    startedAt: parseTs(raw.start_time ?? raw.startTime ?? raw.live_start_time),
    endedAt: parseTs(raw.end_time ?? raw.endTime ?? raw.live_end_time),
    grossSalesAmount: num(raw.gmv ?? raw.pay_amount ?? raw.gross_sales_amount),
    validSalesAmount: num(raw.valid_gmv ?? raw.valid_sales_amount),
    orderCount: num(raw.order_count ?? raw.orderCount),
    refundAmount: num(raw.refund_amount ?? raw.refundAmount),
    raw,
  }
}

export function normalizeReviewRow(rawInput: unknown): NormalizedReview | null {
  if (!rawInput || typeof rawInput !== 'object') return null
  const raw = rawInput as Record<string, unknown>
  const reviewId = str(raw.review_id ?? raw.reviewId ?? raw.id)
  if (!reviewId) return null
  return {
    orderNo: str(raw.order_id ?? raw.orderId ?? raw.package_id) || undefined,
    reviewId,
    buyerName: str(raw.user_name ?? raw.buyer_name ?? raw.nick_name) || undefined,
    score: num(raw.score ?? raw.star ?? raw.rating) || undefined,
    content: str(raw.content ?? raw.review_content ?? raw.text) || undefined,
    reviewTime: parseTs(raw.review_time ?? raw.create_time ?? raw.created_at),
    replyStatus: str(raw.reply_status_desc ?? raw.reply_status ?? raw.has_reply) || undefined,
    raw,
  }
}

export function normalizeShopScore(rawInput: Record<string, unknown>): NormalizedShopScore {
  return {
    score: num(rawInput.shop_score ?? rawInput.score ?? rawInput.total_score) || undefined,
    serviceScore: num(rawInput.service_score ?? rawInput.serviceScore) || undefined,
    logisticsScore: num(rawInput.logistics_score ?? rawInput.logisticsScore) || undefined,
    productScore: num(rawInput.product_score ?? rawInput.productScore) || undefined,
    reviewCount: num(rawInput.review_count ?? rawInput.reviewCount) || undefined,
    raw: rawInput,
  }
}

export function afterSaleStatusForOrder(
  order: NormalizedOrder,
  afterSales: NormalizedAfterSale[],
): string | undefined {
  const hit = afterSales.find((a) => a.orderNo && a.orderNo === order.orderNo)
  if (!hit) return order.afterSaleStatus
  return hit.status || order.afterSaleStatus
}