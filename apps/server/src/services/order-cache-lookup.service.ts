import fs from 'fs'
import path from 'path'

import { getXiangyuRoot } from '../config/env'

type CacheOrder = {
  orderNo?: string
  packageId?: string
  returnsId?: string
  shopTitle?: string
  sourceAccountName?: string
}

function normalizeToken(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, '')
}

function orderMatchesToken(order: CacheOrder, token: string): boolean {
  const q = normalizeToken(token)
  if (!q) return false
  const fields = [order.orderNo, order.packageId, order.returnsId].map((f) =>
    normalizeToken(String(f || '')),
  )
  return fields.some((f) => f && f === q)
}

/** 从祥钰 order-search-cache.json 按订单号精确查店铺 */
export function lookupOrderInSearchCache(orderNo: string): {
  shopTitle: string
  orderNo: string
} | null {
  const q = orderNo.trim()
  if (!q) return null

  const file = path.join(getXiangyuRoot(), 'data', 'order-search-cache.json')
  if (!fs.existsSync(file)) return null

  try {
    const cache = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      orders?: Record<string, CacheOrder>
      index?: Record<string, string[]>
    }
    const token = normalizeToken(q)
    const keys = cache.index?.[token] || []
    for (const key of keys) {
      const order = cache.orders?.[key]
      if (order && orderMatchesToken(order, q)) {
        const shop = String(order.shopTitle || order.sourceAccountName || '').trim()
        const pkg = String(order.packageId || order.orderNo || q).trim()
        if (!shop) continue
        return { shopTitle: shop, orderNo: pkg }
      }
    }
    for (const order of Object.values(cache.orders || {})) {
      if (orderMatchesToken(order, q)) {
        const shop = String(order.shopTitle || order.sourceAccountName || '').trim()
        const pkg = String(order.packageId || order.orderNo || q).trim()
        if (!shop) continue
        return { shopTitle: shop, orderNo: pkg }
      }
    }
  } catch {
    return null
  }
  return null
}
