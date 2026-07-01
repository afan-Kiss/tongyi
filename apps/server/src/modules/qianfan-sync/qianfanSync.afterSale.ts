import { buildArkHeaders, signGetHeaders } from './qianfanSync.xhsSigner'
import { qianfanFetchJson, unwrapData } from './qianfanSync.client'
import type { QianfanApiResult } from './qianfanSync.types'

const AFTER_SALES_URL = 'https://ark.xiaohongshu.com/api/edith/after-sales/returns/v3'
const AFTER_SALE_REFERER = 'https://ark.xiaohongshu.com/app-order/aftersale/list'
const BROAD_STATUS = '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16'
const PAGE_SIZE = 20
const MAX_PAGES = 5

function buildAfterSalesParams(page: number) {
  return {
    page,
    number: PAGE_SIZE,
    keywords: '',
    'goods_source[]': [1, 2],
    sort: 'deadline_for_sort_v1',
    order: 'desc',
    status_in: BROAD_STATUS,
  }
}

function buildAfterSalesUrl(page: number) {
  const params = buildAfterSalesParams(page)
  const parts = [
    `page=${params.page}`,
    `number=${params.number}`,
    'keywords=',
    'goods_source[]=1',
    'goods_source[]=2',
    `sort=${params.sort}`,
    `order=${params.order}`,
    `status_in=${params.status_in}`,
  ]
  return `${AFTER_SALES_URL}?${parts.join('&')}`
}

function extractAfterSales(data: unknown): unknown[] {
  const root = unwrapData<Record<string, unknown>>(data) || (data as Record<string, unknown>)
  const list = root?.returns_list || root?.list || root?.items
  if (Array.isArray(list)) return list
  return []
}

export async function fetchAfterSalePages(cookie: string): Promise<QianfanApiResult<{ items: unknown[]; pages: number }>> {
  const all: unknown[] = []
  let pages = 0

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = buildAfterSalesUrl(page)
    const params = buildAfterSalesParams(page)
    const headers = buildArkHeaders(signGetHeaders(AFTER_SALES_URL, params, cookie), cookie, AFTER_SALE_REFERER)
    const res = await qianfanFetchJson<unknown>(url, { method: 'GET', headers })
    if (!res.ok) return res as QianfanApiResult<{ items: unknown[]; pages: number }>
    pages += 1
    const batch = extractAfterSales(res.data)
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }

  return { ok: true, data: { items: all, pages } }
}
