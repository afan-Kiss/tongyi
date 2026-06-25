import { notifyAuthCheck } from '@/api/client'

export interface XhsOrderRow {
  orderId: string
  orderNo: string
  buyerNick: string
  shopTitle: string
  sourceAccountName?: string
  amount: string
  orderPaid: number
  productPrice: number
  shippingFee: number
  redDiscountAmount: number
  createdAt: number
  status: string
  statusDesc?: string
  afterSaleStatus?: string
  afterSaleStatusDesc?: string
  dayLabel?: string
  /** 售后搜索：退货物流单号 */
  returnExpressNo?: string
  /** 售后搜索：发货物流单号 */
  shipExpressNo?: string
  packageId?: string
  returnsId?: string
  productTitle?: string
  /** 千帆售后/订单详情页 */
  arkDetailUrl?: string
  searchSource?: string
}

export interface XhsOrderSearchResult {
  query: string
  days: number
  message: string
  warnings?: string[]
  shopSummary: { name: string; count: number }[]
  items: XhsOrderRow[]
  returnRelatedCount?: number
  searchMode?: string
}

export interface XhsOrdersPayload {
  source?: string
  message?: string
  warnings?: string[]
  today: XhsOrderRow[]
  yesterday: XhsOrderRow[]
  all: XhsOrderRow[]
  cached?: boolean
}

function normalizeRow(raw: Record<string, unknown>): XhsOrderRow {
  const shop = String(raw.shopTitle || raw.sourceAccountName || '').trim()
  const orderNo = String(raw.orderNo || raw.orderId || '')
  const packageId = String(raw.packageId || (orderNo.startsWith('P') ? orderNo : '') || '')
  const returnsId = raw.returnsId ? String(raw.returnsId).trim() : ''
  const arkDetailUrl = raw.arkDetailUrl
    ? String(raw.arkDetailUrl)
    : returnsId
      ? `https://ark.xiaohongshu.com/app-order/aftersale/detail?returnId=${encodeURIComponent(returnsId.startsWith('R') ? returnsId : `R${returnsId}`)}`
      : packageId
        ? `https://ark.xiaohongshu.com/app-order/order/detail/${encodeURIComponent(packageId.startsWith('P') ? packageId : `P${packageId}`)}`
        : ''
  return {
    orderId: String(raw.orderId || raw.orderNo || ''),
    orderNo,
    buyerNick: String(raw.buyerNick || raw.nickName || '买家'),
    shopTitle: shop,
    sourceAccountName: shop,
    amount: String(raw.amount || ''),
    orderPaid: Number(raw.orderPaid ?? raw.orderPaidNum ?? 0),
    productPrice: Number(raw.productPrice ?? raw.productPriceNum ?? 0),
    shippingFee: Number(raw.shippingFee ?? raw.shippingFeeNum ?? 0),
    redDiscountAmount: Number(raw.redDiscountAmount ?? raw.redDiscountNum ?? 0),
    createdAt: Number(raw.createdAt || 0),
    status: String(raw.status || ''),
    statusDesc: String(raw.statusDesc || raw.status || ''),
    afterSaleStatus: String(raw.afterSaleStatus || ''),
    afterSaleStatusDesc: String(raw.afterSaleStatusDesc || ''),
    dayLabel: raw.dayLabel ? String(raw.dayLabel) : undefined,
    returnExpressNo: raw.returnExpressNo ? String(raw.returnExpressNo) : undefined,
    shipExpressNo: raw.shipExpressNo ? String(raw.shipExpressNo) : undefined,
    packageId: packageId || undefined,
    returnsId: raw.returnsId ? String(raw.returnsId) : undefined,
    productTitle: raw.productTitle ? String(raw.productTitle) : undefined,
    arkDetailUrl: arkDetailUrl || undefined,
    searchSource: raw.searchSource ? String(raw.searchSource) : undefined,
  }
}

function parseProxyError(res: Response, data: { error?: string; message?: string; code?: string }): never {
  if (res.status === 403 && data?.code === 'LICENSE_DISABLED') {
    window.dispatchEvent(
      new CustomEvent('license:blocked', { detail: { allowed: false, message: data.message || '软件不可用' } }),
    )
    throw new Error(String(data.message || '软件不可用'))
  }
  if (res.status === 401) {
    notifyAuthCheck()
    throw new Error(String(data.message || '请先登录'))
  }
  throw new Error(String(data.error || data.message || '订单查询失败'))
}

export async function fetchXhsOrders(refresh = false): Promise<XhsOrdersPayload> {
  const q = refresh ? '?refresh=1' : ''
  const res = await fetch(`/xiangyu-proxy/api/orders${q}`, { credentials: 'include' })
  const data = (await res.json()) as XhsOrdersPayload & { error?: string; message?: string; code?: string }
  if (!res.ok) parseProxyError(res, data)
  const mapList = (list?: Record<string, unknown>[]) => (list || []).map((o) => normalizeRow(o))
  return {
    ...data,
    today: mapList(data.today as unknown as Record<string, unknown>[]),
    yesterday: mapList(data.yesterday as unknown as Record<string, unknown>[]),
    all: mapList(data.all as unknown as Record<string, unknown>[]),
  }
}

export async function searchXhsOrders(query: string, days = 30): Promise<XhsOrderSearchResult> {
  const q = encodeURIComponent(query.trim())
  const res = await fetch(`/xiangyu-proxy/api/orders/search?q=${q}&days=${days}`, { credentials: 'include' })
  const data = (await res.json()) as XhsOrderSearchResult & { error?: string; message?: string; code?: string }
  if (!res.ok) parseProxyError(res, data)
  return {
    ...data,
    items: (data.items || []).map((o) => normalizeRow(o as unknown as Record<string, unknown>)),
  }
}
