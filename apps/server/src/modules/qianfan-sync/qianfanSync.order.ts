import { buildArkHeaders, signGetHeaders, signPostHeaders } from './qianfanSync.xhsSigner'
import { qianfanFetchJson, unwrapData } from './qianfanSync.client'
import type { QianfanApiResult } from './qianfanSync.types'

const ORDER_API_URL = 'https://ark.xiaohongshu.com/api/edith/fulfillment/order/page'
const ORDER_REFERER = 'https://ark.xiaohongshu.com/app-order/order/query'
const PAGE_SIZE = 20
const MAX_PAGES = 5
const TZ_OFFSET_MS = 8 * 3600000

function shanghaiTodayParts() {
  const sh = new Date(Date.now() + TZ_OFFSET_MS)
  return { y: sh.getUTCFullYear(), m: sh.getUTCMonth(), d: sh.getUTCDate() }
}

function startOfShanghaiDay(offsetDays = 0) {
  const { y, m, d } = shanghaiTodayParts()
  return Date.UTC(y, m, d - offsetDays, -8, 0, 0, 0)
}

function endOfShanghaiDay(offsetDays = 0) {
  const { y, m, d } = shanghaiTodayParts()
  return Date.UTC(y, m, d - offsetDays, 15, 59, 59, 999)
}

function buildOrderBody(pageNo: number, startMs: number, endMs: number) {
  return {
    page_no: pageNo,
    page_size: PAGE_SIZE,
    multi_search_field: '',
    order_tag_list: [],
    order_type_list: [],
    promise_ship_time_type_list: [],
    after_sale_status_list: [],
    seller_mark_priority_list: [],
    seller_mark_note_status_list: [],
    status: [],
    time_range_list: [{ time_type: 3, start_time: startMs, end_time: endMs }],
    overdue_status: -2,
    sort_by: { sort_field: 'ordered_at', desc: true },
    need_declare_info: false,
    need_declare_times: false,
    allow_es_fallback: true,
  }
}

function extractPackages(data: unknown): unknown[] {
  const root = unwrapData<Record<string, unknown>>(data) || (data as Record<string, unknown>)
  const packages = root?.packages || root?.package_list || root?.order_list
  if (Array.isArray(packages)) return packages
  return []
}

export interface FetchOrdersOptions {
  cookie: string
  daysBack?: number
  maxPages?: number
}

export async function fetchOrderPages(
  options: FetchOrdersOptions,
): Promise<QianfanApiResult<{ items: unknown[]; pages: number }>> {
  const daysBack = options.daysBack ?? 30
  const maxPages = options.maxPages ?? MAX_PAGES
  const startMs = startOfShanghaiDay(daysBack)
  const endMs = endOfShanghaiDay(0)
  const all: unknown[] = []
  let pages = 0

  for (let page = 1; page <= maxPages; page += 1) {
    const body = buildOrderBody(page, startMs, endMs)
    const headers = buildArkHeaders(signPostHeaders(ORDER_API_URL, body, options.cookie), options.cookie, ORDER_REFERER)
    const res = await qianfanFetchJson<unknown>(ORDER_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) return res as QianfanApiResult<{ items: unknown[]; pages: number }>
    pages += 1
    const batch = extractPackages(res.data)
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }

  return { ok: true, data: { items: all, pages } }
}

export async function fetchRecentOrders(cookie: string, daysBack = 30) {
  return fetchOrderPages({ cookie, daysBack })
}

export { startOfShanghaiDay, endOfShanghaiDay }
