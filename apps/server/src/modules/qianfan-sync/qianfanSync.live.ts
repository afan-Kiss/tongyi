import { buildArkHeaders, signPostHeaders } from './qianfanSync.xhsSigner'
import { qianfanFetchJson, unwrapData } from './qianfanSync.client'
import type { QianfanApiResult } from './qianfanSync.types'
import type { NormalizedLiveSession, NormalizedOrder } from './qianfanSync.types'

const LIVE_ROOM_URL = 'https://ark.xiaohongshu.com/api/edith/live/room/list'
const LIVE_REFERER = 'https://ark.xiaohongshu.com/app-live/live/list'

function extractLiveRooms(data: unknown): unknown[] {
  const root = unwrapData<Record<string, unknown>>(data) || (data as Record<string, unknown>)
  const list = root?.room_list || root?.live_room_list || root?.list || root?.items
  if (Array.isArray(list)) return list
  return []
}

export async function fetchLiveRoomPages(
  cookie: string,
): Promise<QianfanApiResult<{ items: unknown[]; pages: number }>> {
  const body = { source: 'PC', page_no: 1, page_size: 20 }
  const headers = buildArkHeaders(signPostHeaders(LIVE_ROOM_URL, body, cookie), cookie, LIVE_REFERER)
  const res = await qianfanFetchJson<unknown>(LIVE_ROOM_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) return res as QianfanApiResult<{ items: unknown[]; pages: number }>
  const items = extractLiveRooms(res.data)
  return { ok: true, data: { items, pages: 1 } }
}

/** 从订单 raw 字段聚合直播场次（接口不可用时兜底） */
export function aggregateLiveSessionsFromOrders(orders: NormalizedOrder[]): NormalizedLiveSession[] {
  const map = new Map<string, NormalizedLiveSession>()

  for (const order of orders) {
    const sessionNo = order.liveSessionNo || ''
    if (!sessionNo) continue
    const key = sessionNo
    const existing = map.get(key) || {
      sessionNo,
      title: order.productTitle,
      anchorName: order.anchorName,
      startedAt: order.paidAt,
      endedAt: order.paidAt,
      grossSalesAmount: 0,
      validSalesAmount: 0,
      orderCount: 0,
      refundAmount: 0,
      raw: { source: 'order_aggregate', sessionNo },
    }
    existing.grossSalesAmount += order.payAmount
    existing.validSalesAmount += order.validAmount
    existing.refundAmount += order.refundAmount
    existing.orderCount += 1
    if (order.paidAt && (!existing.startedAt || order.paidAt < existing.startedAt)) {
      existing.startedAt = order.paidAt
    }
    if (order.paidAt && (!existing.endedAt || order.paidAt > existing.endedAt)) {
      existing.endedAt = order.paidAt
    }
    map.set(key, existing)
  }

  return [...map.values()]
}
