import React, { useCallback, useEffect, useState } from 'react'

import { Copy, ExternalLink, Search } from 'lucide-react'

import { formatOrderTime, fmtYuan } from '@/lib/xhsOrderMatch'
import { openXhsArkDetail, searchXhsOrders, type XhsOrderRow } from '@/lib/xhsOrdersApi'

function isReturnRelated(order: XhsOrderRow): boolean {
  const text = [order.afterSaleStatusDesc, order.afterSaleStatus, order.status, order.statusDesc, order.returnsId]
    .filter(Boolean)
    .join(' ')
  return /退|售后|退款|换货|拒收|待收货/.test(text)
}

/** 卖家退货仓（买家寄回地址），界面不展示 */
function isReturnWarehouseAddress(addr?: string): boolean {
  const a = (addr || '').trim()
  if (!a) return false
  return /中贸广场|碑林区长安路|长安路街道中贸/.test(a)
}

function displayAddress(addr?: string): string | undefined {
  const a = (addr || '').trim()
  if (!a || isReturnWarehouseAddress(a)) return undefined
  return a
}

export interface ReturnOrderSearchPanelProps {
  /** 嵌入扫码页：隐藏独立搜索框，由父级传入关键词 */
  embedded?: boolean
  query?: string
  /** 父级递增以触发重新搜索 */
  searchToken?: number
  onLoadingChange?: (loading: boolean) => void
}

export const ReturnOrderSearchPanel: React.FC<ReturnOrderSearchPanelProps> = ({
  embedded = false,
  query: externalQuery = '',
  searchToken = 0,
  onLoadingChange,
}) => {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(
    embedded ? '' : '精确查询：完整订单号（P）、售后单号（R）、发货/退货物流单号（近 30 天）',
  )
  const [error, setError] = useState('')
  const [items, setItems] = useState<XhsOrderRow[]>([])
  const [shopSummary, setShopSummary] = useState<{ name: string; count: number }[]>([])
  const [copiedNo, setCopiedNo] = useState('')
  const [arkOpeningKey, setArkOpeningKey] = useState('')

  const runSearch = useCallback(
    async (raw?: string) => {
      const q = (raw ?? (embedded ? externalQuery : query)).trim()
      if (!q) {
        if (!embedded) setError('请输入查询内容')
        return
      }

      setLoading(true)
      onLoadingChange?.(true)
      setError('')
      setCopiedNo('')

      try {
        const data = await searchXhsOrders(q, 30)
        setItems(data.items)
        setShopSummary(data.shopSummary || [])
        const sourceHint =
          data.source === 'cache'
            ? ' · 本地缓存'
            : data.source === 'live'
              ? ' · 实时查询'
              : ''
        setStatus((data.message || `共 ${data.items.length} 条`) + sourceHint)
        const warnParts = [...(data.warnings || [])]
        if (data.cacheStale) warnParts.push('本地缓存已超过 180 分钟')
        if (warnParts.length) setError(warnParts.join('；'))
      } catch (e) {
        setItems([])
        setShopSummary([])
        setStatus('')
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
        onLoadingChange?.(false)
      }
    },
    [query, embedded, externalQuery, onLoadingChange],
  )

  useEffect(() => {
    if (!embedded || searchToken <= 0) return
    void runSearch(externalQuery)
  }, [embedded, externalQuery, searchToken, runSearch])

  const copyOrderNo = async (orderNo: string) => {
    try {
      await navigator.clipboard.writeText(orderNo)
      setCopiedNo(orderNo)
    } catch {
      setCopiedNo('')
    }
  }

  const openArkOrder = async (order: XhsOrderRow) => {
    const pkg = (order.packageId || order.orderNo || '').trim()
    if (!pkg) return
    const key = `${pkg}::order`
    setArkOpeningKey(key)
    setError('')
    try {
      await openXhsArkDetail({
        orderNo: order.orderNo,
        packageId: pkg,
        shopTitle: order.shopTitle || order.sourceAccountName || '',
        openTarget: 'order',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setArkOpeningKey('')
    }
  }

  const openArkAftersale = async (order: XhsOrderRow) => {
    const returnId = (order.returnsId || '').trim()
    if (!returnId) return
    const key = `${returnId}::aftersale`
    setArkOpeningKey(key)
    setError('')
    try {
      await openXhsArkDetail({
        returnId,
        shopTitle: order.shopTitle || order.sourceAccountName || '',
        openTarget: 'aftersale',
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setArkOpeningKey('')
    }
  }

  return (
    <div
      className={embedded ? 'mt-4' : 'rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm'}
      data-no-scan-refocus
    >
      {!embedded && (
        <>
          <p className="text-sm text-slate-600">
            精确查询：完整订单号（P 开头）、售后单号（R 开头）、发货/退货物流单号
          </p>
          <div className="mt-3 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-300"
              placeholder="P7979… / R6721… / SF5117802909776"
              value={query}
              disabled={loading}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void runSearch()
                }
              }}
            />
            <button
              type="button"
              disabled={loading || !query.trim()}
              onClick={() => void runSearch()}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              <Search size={16} />
              查询
            </button>
          </div>
        </>
      )}

      {embedded && loading && (
        <p className="py-4 text-center text-xs text-slate-400">正在四店综合查订单…</p>
      )}

      {status && <p className={`text-[11px] text-slate-500 ${embedded ? 'mt-1' : 'mt-2'}`}>{status}</p>}
      {error && <p className="mt-1 text-[11px] text-amber-700">{error}</p>}

      {shopSummary.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shopSummary.map((s) => (
            <span
              key={s.name}
              className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-800"
            >
              {s.name} {s.count}单
            </span>
          ))}
        </div>
      )}

      <div className={`max-h-[420px] space-y-2 overflow-y-auto ${embedded ? 'mt-2' : 'mt-3'}`}>
        {!embedded && loading && <p className="py-6 text-center text-xs text-slate-400">正在查询四店订单…</p>}
        {!loading && items.length === 0 && (embedded ? externalQuery.trim() : query.trim()) && !error && (
          <p className="py-6 text-center text-xs text-slate-400">未找到匹配订单</p>
        )}
        {items.map((o) => {
          const ret = isReturnRelated(o)
          const recvAddr = displayAddress(o.receiverAddress)
          const sendAddr = displayAddress(o.senderAddress)
          const shipNo = o.shipExpressNo?.trim()
          const returnNo =
            o.returnExpressNo?.trim() &&
            o.returnExpressNo.trim().toUpperCase() !== (shipNo || '').toUpperCase()
              ? o.returnExpressNo.trim()
              : undefined
          return (
            <div
              key={`${o.shopTitle}::${o.orderNo}`}
              className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${
                ret ? 'border-amber-200 bg-amber-50/80' : 'border-slate-100 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{o.orderNo}</p>
                  {o.returnsId && <p className="text-[10px] text-slate-400">售后单：{o.returnsId}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {(o.packageId || o.orderNo) && (
                    <button
                      type="button"
                      disabled={!!arkOpeningKey}
                      onClick={() => void openArkOrder(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] text-violet-800 hover:bg-violet-100 disabled:opacity-60"
                    >
                      <ExternalLink size={12} />
                      {arkOpeningKey === `${(o.packageId || o.orderNo || '').trim()}::order`
                        ? '跳转…'
                        : '千帆订单'}
                    </button>
                  )}
                  {o.returnsId && (
                    <button
                      type="button"
                      disabled={!!arkOpeningKey}
                      onClick={() => void openArkAftersale(o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    >
                      <ExternalLink size={12} />
                      {arkOpeningKey === `${o.returnsId.trim()}::aftersale` ? '跳转…' : '千帆售后'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyOrderNo(o.orderNo)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                  >
                    <Copy size={12} />
                    {copiedNo === o.orderNo ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-violet-800">店铺：{o.shopTitle || '—'}</p>
              <p>买家：{o.buyerNick}</p>
              {o.productTitle && <p>商品：{o.productTitle}</p>}
              <p>
                实付：¥{fmtYuan(o.orderPaid)} · {formatOrderTime(o.createdAt) || '—'}
              </p>
              {recvAddr && <p>收货地址：{recvAddr}</p>}
              {shipNo && <p>发货物流：{shipNo}</p>}
              {returnNo && <p>退货物流：{returnNo}</p>}
              <p>
                状态：{o.statusDesc || o.status || '—'}
                {o.afterSaleStatusDesc ? ` · 售后：${o.afterSaleStatusDesc}` : ''}
              </p>
              {ret && <p className="mt-0.5 font-medium text-amber-800">退货/售后相关</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
