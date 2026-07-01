import { buildArkHeaders, signPostHeaders } from './qianfanSync.xhsSigner'
import { qianfanFetchJson, unwrapData } from './qianfanSync.client'
import type { QianfanApiResult } from './qianfanSync.types'

const SHOP_SCORE_URL = 'https://ark.xiaohongshu.com/api/edith/shop/score/get_shop_score'
const REVIEW_LIST_URL = 'https://ark.xiaohongshu.com/api/edith/review/review_list_count_detail'
const REVIEW_MANAGER_URL = 'https://ark.xiaohongshu.com/api/edith/review/review_manager'
const REVIEW_REFERER = 'https://ark.xiaohongshu.com/app-review/review/list'

const PAGE_SIZE = 20
const MAX_PAGES = 3

function extractReviewList(data: unknown): unknown[] {
  const root = unwrapData<Record<string, unknown>>(data) || (data as Record<string, unknown>)
  const nested = root?.review_level_count_detail as Record<string, unknown> | undefined
  const list = nested?.review_list || root?.review_list || root?.list || root?.items
  if (Array.isArray(list)) return list
  return []
}

export async function fetchShopScore(cookie: string): Promise<QianfanApiResult<Record<string, unknown>>> {
  const body = { source: 'PC' }
  const headers = buildArkHeaders(signPostHeaders(SHOP_SCORE_URL, body, cookie), cookie, REVIEW_REFERER)
  const res = await qianfanFetchJson<unknown>(SHOP_SCORE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) return res as QianfanApiResult<Record<string, unknown>>
  const root = unwrapData<Record<string, unknown>>(res.data) || (res.data as Record<string, unknown>)
  const dto = (root?.shop_score_dto || root) as Record<string, unknown>
  return { ok: true, data: dto }
}

export async function fetchReviewPages(
  cookie: string,
): Promise<QianfanApiResult<{ items: unknown[]; pages: number }>> {
  const all: unknown[] = []
  let pages = 0

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = {
      source: 1,
      page_no: page,
      page_size: PAGE_SIZE,
      review_type: 0,
      reply_status: -1,
    }
    const headers = buildArkHeaders(signPostHeaders(REVIEW_LIST_URL, body, cookie), cookie, REVIEW_REFERER)
    let res = await qianfanFetchJson<unknown>(REVIEW_LIST_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const altBody = { source: 1, page, number: PAGE_SIZE }
      const altHeaders = buildArkHeaders(signPostHeaders(REVIEW_MANAGER_URL, altBody, cookie), cookie, REVIEW_REFERER)
      res = await qianfanFetchJson<unknown>(REVIEW_MANAGER_URL, {
        method: 'POST',
        headers: altHeaders,
        body: JSON.stringify(altBody),
      })
    }

    if (!res.ok) return res as QianfanApiResult<{ items: unknown[]; pages: number }>
    pages += 1
    const batch = extractReviewList(res.data)
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }

  return { ok: true, data: { items: all, pages } }
}
