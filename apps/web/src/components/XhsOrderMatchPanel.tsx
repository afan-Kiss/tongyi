import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RefreshCw } from 'lucide-react'

import {
  buildOrderMatches,
  fmtYuan,
  formatOrderTime,
  inferProductAmount,
  parseAmountText,
  pickRecommendedMatch,
  type XhsOrderMatch,
} from '@/lib/xhsOrderMatch'
import { fetchXhsOrders, type XhsOrderRow } from '@/lib/xhsOrdersApi'

type Props = {
  priceText: string
  orderNo: string
  active: boolean
  hoverWaiting?: boolean
  hoverSecondsLeft?: number
  onPickOrder: (orderNo: string, buyerNick: string) => void
}

function shopSummary(orders: XhsOrderRow[]): string {
  const counts = new Map<string, number>()
  for (const o of orders) {
    const name = o.shopTitle || '未命名店铺'
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  if (!counts.size) return '暂无店铺订单'
  return [...counts.entries()].map(([name, n]) => `${name} ${n}单`).join(' · ')
}

export const XhsOrderMatchPanel: React.FC<Props> = ({
  priceText,
  orderNo,
  active,
  hoverWaiting = false,
  hoverSecondsLeft = 2,
  onPickOrder,
}) => {
  const [orders, setOrders] = useState<XhsOrderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const debounceRef = useRef<number | null>(null)

  const load = useCallback(async (refresh = false) => {
    setLoading(true)
    setError('')
    setStatus(refresh ? '正在刷新订单…' : '正在获取四店订单…')
    try {
      const data = await fetchXhsOrders(refresh)
      const list = data.all || []
      setOrders(list)
      const shops = new Set(list.map((o) => o.shopTitle).filter(Boolean))
      setStatus(
        list.length
          ? `已加载 ${list.length} 条（${shops.size} 个店铺）· ${shopSummary(list)}`
          : data.message || '今日和昨日暂无订单',
      )
      if (data.warnings?.length) setError(data.warnings.join('；'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStatus('订单加载失败')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void load(false)
  }, [active, load])

  const idleHint = hoverWaiting
    ? `鼠标停留在此区域 ${Math.max(0, hoverSecondsLeft)} 秒后加载订单…`
    : '鼠标停留在此区域 2 秒后加载订单…'

  const matches = useMemo(() => buildOrderMatches(orders, priceText), [orders, priceText])
  const recommended = useMemo(() => pickRecommendedMatch(matches), [matches])

  const [displayMatches, setDisplayMatches] = useState<XhsOrderMatch[]>([])

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const price = priceText.trim()
      if (price && parseAmountText(price) === null) {
        setDisplayMatches([])
        setStatus('售价格式无效，请输入数字')
        return
      }
      setDisplayMatches(matches)
      if (!orders.length) return
      if (price && parseAmountText(price) !== null) {
        setStatus(
          matches.length
            ? `匹配到 ${matches.length} 条（共 ${orders.length} 条 · ${shopSummary(orders)}）`
            : '未匹配到订单',
        )
      } else {
        setStatus(`共 ${orders.length} 条订单（${shopSummary(orders)}，输入售价后自动匹配）`)
      }
    }, 350)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [matches, priceText, orders.length])

  return (
    <div
      className={`mt-3 rounded-xl border p-3 transition-colors duration-200 ${
        hoverWaiting
          ? 'border-emerald-300 bg-emerald-50/80'
          : 'border-violet-100 bg-violet-50/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-medium ${hoverWaiting ? 'text-emerald-800' : 'text-violet-900'}`}>
          小红书订单（四店）
        </p>
        <button
          type="button"
          disabled={loading || !active}
          onClick={() => void load(true)}
          className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] text-violet-700 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>
      {!active ? (
        <p
          className={`mt-2 leading-snug ${
            hoverWaiting ? 'text-sm font-semibold text-emerald-600' : 'text-[11px] text-slate-500'
          }`}
        >
          {idleHint}
        </p>
      ) : (
        <p className="mt-1 text-[11px] text-slate-500">{status}</p>
      )}
      {error && <p className="mt-1 text-[11px] text-amber-700">{error}</p>}

      <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {loading && !displayMatches.length && (
          <p className="py-4 text-center text-xs text-slate-400">加载中…</p>
        )}
        {!loading && !displayMatches.length && (
          <p className="py-4 text-center text-xs text-slate-400">
            {priceText.trim() ? '暂无匹配订单' : '暂无订单或尚未加载'}
          </p>
        )}
        {displayMatches.map((m) => {
          const o = m.order
          const isRec = recommended?.order.orderNo === o.orderNo
          const isSelected = orderNo === o.orderNo
          const product = inferProductAmount(o)
          const priceLabel = o.productPrice > 0 ? '商品价格' : '商品反推'
          return (
            <button
              key={`${o.shopTitle}::${o.orderNo}`}
              type="button"
              onClick={() => onPickOrder(o.orderNo, o.buyerNick)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-[11px] leading-relaxed transition ${
                isSelected
                  ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-300'
                  : isRec
                    ? 'border-emerald-400 bg-emerald-50/80'
                    : 'border-white bg-white hover:border-violet-200 hover:bg-violet-50/40'
              }`}
            >
              {isRec && <span className="font-semibold text-emerald-700">【推荐】</span>}
              {o.dayLabel && <span className="text-slate-400">{o.dayLabel} · </span>}
              {formatOrderTime(o.createdAt) && (
                <span className="text-slate-500">{formatOrderTime(o.createdAt)} · </span>
              )}
              <span className="font-medium text-slate-800">店铺：{o.shopTitle || '—'}</span>
              <br />
              买家：{o.buyerNick}
              <br />
              实付：¥{fmtYuan(o.orderPaid)}｜平台优惠：¥{fmtYuan(o.redDiscountAmount)}｜运费：¥
              {fmtYuan(o.shippingFee > 0 ? o.shippingFee : 18)}
              <br />
              {priceLabel}：¥{fmtYuan(product)}
              <br />
              订单：{o.orderNo}
              {m.score >= 0 && (
                <>
                  <br />
                  匹配度：{m.score}%
                  {m.matchReason ? ` · ${m.matchReason}` : ''}
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
