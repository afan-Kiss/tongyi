import { notifyAuthCheck } from '@/api/client'
import { pickBestBuyerNick } from '@/lib/buyerNickDisplay'

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
  /** 收货地址（展示用） */
  receiverAddress?: string
  /** 寄件/发件地址 */
  senderAddress?: string
  receiverPhone?: string
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
  source?: 'cache' | 'live'
  cachedAt?: number
  cacheStale?: boolean
  cacheOrderCount?: number
}

export interface XhsCookieHealthResult {
  ok?: boolean
  allOk: boolean
  message: string
  cached?: boolean
  checkedAt: number
  accounts: {
    name: string
    ok: boolean
    expired?: boolean
    error?: string
    checkedAt?: number
  }[]
}

export interface XhsSearchCacheStatus {
  ok?: boolean
  enabled: boolean
  syncedAt: number | null
  stale: boolean
  syncInProgress: boolean
  orderCount: number
  nextSyncInMs: number
  lastSyncError?: string | null
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
    buyerNick: pickBestBuyerNick(
      String(raw.buyerNick || ''),
      String(raw.nickName || ''),
      String(raw.buyerName || ''),
    ) || '买家',
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
    receiverAddress: raw.receiverAddress ? String(raw.receiverAddress) : undefined,
    senderAddress: raw.senderAddress ? String(raw.senderAddress) : undefined,
    receiverPhone: raw.receiverPhone ? String(raw.receiverPhone) : undefined,
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

export async function fetchXhsCookieHealth(force = false): Promise<XhsCookieHealthResult> {
  const q = force ? '?force=1' : ''
  const res = await fetch(`/xiangyu-proxy/api/accounts/cookie-health${q}`, { credentials: 'include' })
  const data = (await res.json()) as XhsCookieHealthResult & { error?: string; message?: string; code?: string }
  if (!res.ok) parseProxyError(res, data)
  return data
}

export async function fetchXhsSearchCacheStatus(): Promise<XhsSearchCacheStatus> {
  const res = await fetch('/xiangyu-proxy/api/orders/search-cache/status', { credentials: 'include' })
  const data = (await res.json()) as XhsSearchCacheStatus & { error?: string; message?: string; code?: string }
  if (!res.ok) parseProxyError(res, data)
  return data
}

export type OpenXhsArkDetailInput = {
  orderNo?: string
  returnId?: string
  packageId?: string
  shopTitle?: string
  /** order=订单详情（推荐）；aftersale=售后详情；auto=按单号类型推断 */
  openTarget?: 'order' | 'aftersale' | 'auto'
}

function isReturnIdToken(v: string): boolean {
  return /^R\d/i.test(v.trim())
}

function isPackageIdToken(v: string): boolean {
  return /^P\d/i.test(v.trim())
}

/** 换取 SSO ticket 后在新标签页打开千帆售后/订单详情 */
export async function openXhsArkDetail(input: OpenXhsArkDetailInput): Promise<void> {
  let returnId = String(input.returnId || '').trim()
  let pkg = String(input.packageId || '').trim()
  let shop = String(input.shopTitle || '').trim()
  const orderNo = String(input.orderNo || '').trim()
  const openTarget = input.openTarget || 'auto'

  if (!returnId && !pkg && orderNo) {
    if (isReturnIdToken(orderNo)) returnId = orderNo
    else pkg = orderNo
  }

  if (!returnId && !pkg) {
    throw new Error('缺少订单号或售后单号')
  }

  const wantAftersale =
    openTarget === 'aftersale' || (openTarget === 'auto' && isReturnIdToken(returnId) && !pkg)
  const wantOrder =
    openTarget === 'order' || (openTarget === 'auto' && !!pkg && !isReturnIdToken(returnId))

  if (!shop || (wantOrder && !pkg)) {
    const q = wantAftersale && returnId ? returnId : pkg || returnId || orderNo
    const data = await searchXhsOrders(q, 30)
    const hit = data.items[0]
    if (!hit) throw new Error(`未找到订单 ${q}，请确认本地缓存已同步`)
    shop = hit.shopTitle || hit.sourceAccountName || ''
    if (wantAftersale && !returnId && hit.returnsId) returnId = hit.returnsId.trim()
    if (!pkg) pkg = (hit.packageId || hit.orderNo || '').trim()
  }

  const params = new URLSearchParams()
  params.set('shop', shop)
  params.set('format', 'json')
  if (wantAftersale && returnId) {
    params.set('returnId', returnId)
  } else if (pkg) {
    params.set('packageId', pkg)
  } else if (returnId) {
    params.set('returnId', returnId)
  }

  const res = await fetch(`/xiangyu-proxy/api/orders/ark-detail?${params.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    url?: string
    error?: string
    message?: string
    code?: string
  }
  if (res.status === 401) {
    notifyAuthCheck()
    throw new Error(String(data.message || '请先登录'))
  }
  if (res.status === 403 && data?.code === 'LICENSE_DISABLED') {
    window.dispatchEvent(
      new CustomEvent('license:blocked', { detail: { allowed: false, message: data.message || '软件不可用' } }),
    )
    throw new Error(String(data.message || '软件不可用'))
  }
  if (!res.ok || !data.url) {
    throw new Error(String(data.error || data.message || `打开失败 (${res.status})`))
  }
  if (!data.ok) {
    throw new Error(String(data.error || '未能自动切换店铺，请确认该店千帆工作台已打开'))
  }
  window.open(data.url, '_blank', 'noopener,noreferrer')
}
