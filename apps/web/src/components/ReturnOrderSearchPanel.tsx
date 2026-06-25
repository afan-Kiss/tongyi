import React, { useCallback, useState } from 'react'



import { Copy, ExternalLink, Search } from 'lucide-react'



import { formatOrderTime, fmtYuan } from '@/lib/xhsOrderMatch'
import { notifyAuthCheck } from '@/api/client'
import { searchXhsOrders, type XhsOrderRow } from '@/lib/xhsOrdersApi'



function isReturnRelated(order: XhsOrderRow): boolean {

  const text = [order.afterSaleStatusDesc, order.afterSaleStatus, order.status, order.statusDesc, order.returnsId]

    .filter(Boolean)

    .join(' ')

  return /退|售后|退款|换货|拒收|待收货/.test(text)

}



export const ReturnOrderSearchPanel: React.FC = () => {

  const [query, setQuery] = useState('')

  const [loading, setLoading] = useState(false)

  const [status, setStatus] = useState('输入物流单号、订单号(P开头)或买家昵称，查询四店售后/订单（近 30 天）')

  const [error, setError] = useState('')

  const [items, setItems] = useState<XhsOrderRow[]>([])

  const [shopSummary, setShopSummary] = useState<{ name: string; count: number }[]>([])

  const [copiedNo, setCopiedNo] = useState('')
  const [arkOpeningKey, setArkOpeningKey] = useState('')



  const runSearch = useCallback(async (raw?: string) => {

    const q = (raw ?? query).trim()

    if (!q) {

      setError('请输入查询内容')

      return

    }

    setLoading(true)

    setError('')

    setCopiedNo('')

    try {

      const data = await searchXhsOrders(q, 30)

      setItems(data.items)

      setShopSummary(data.shopSummary || [])

      setStatus(data.message || `共 ${data.items.length} 条`)

      if (data.warnings?.length) setError(data.warnings.join('；'))

    } catch (e) {

      setItems([])

      setShopSummary([])

      setStatus('')

      setError(e instanceof Error ? e.message : String(e))

    } finally {

      setLoading(false)

    }

  }, [query])



  const copyOrderNo = async (orderNo: string) => {

    try {

      await navigator.clipboard.writeText(orderNo)

      setCopiedNo(orderNo)

    } catch {

      setCopiedNo('')

    }

  }



  const openArkDetail = async (order: XhsOrderRow) => {
    const returnId = (order.returnsId || '').trim()
    const pkg = (order.packageId || order.orderNo || '').trim()
    if (!returnId && !pkg) return
    const key = returnId || pkg
    const params = new URLSearchParams()
    params.set('shop', order.shopTitle || order.sourceAccountName || '')
    params.set('format', 'json')
    if (returnId) params.set('returnId', returnId)
    else if (pkg) params.set('packageId', pkg)
    setArkOpeningKey(key)
    setError('')
    try {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setArkOpeningKey('')
    }
  }



  return (

    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm" data-no-scan-refocus>

      <p className="text-sm text-slate-600">

        支持物流单号（如 SF…）、订单号（P 开头）、买家昵称；匹配后可在千帆打开售后详情

      </p>

      <div className="mt-3 flex gap-2">

        <input

          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-300"

          placeholder="物流单号 / 订单号 / 买家昵称"

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



      {status && <p className="mt-2 text-[11px] text-slate-500">{status}</p>}

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



      <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">

        {loading && <p className="py-6 text-center text-xs text-slate-400">正在查询四店订单…</p>}

        {!loading && items.length === 0 && query.trim() && !error && (

          <p className="py-6 text-center text-xs text-slate-400">未找到匹配订单</p>

        )}

        {items.map((o) => {

          const ret = isReturnRelated(o)

          return (

            <div

              key={`${o.shopTitle}::${o.orderNo}::${o.returnsId || ''}`}

              className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${

                ret ? 'border-amber-200 bg-amber-50/80' : 'border-slate-100 bg-white'

              }`}

            >

              <div className="flex items-start justify-between gap-2">

                <div className="min-w-0">

                  <p className="font-semibold text-slate-900">{o.orderNo}</p>

                  {o.returnsId && (

                    <p className="text-[10px] text-slate-400">售后单：{o.returnsId}</p>

                  )}

                </div>

                <div className="flex shrink-0 gap-1">

                  {(o.returnsId || o.packageId || o.orderNo) && (

                    <button

                      type="button"

                      disabled={!!arkOpeningKey}

                      onClick={() => void openArkDetail(o)}

                      className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] text-violet-800 hover:bg-violet-100 disabled:opacity-60"

                    >

                      <ExternalLink size={12} />

                      {arkOpeningKey === (o.returnsId || o.packageId || o.orderNo || '') ? '换票跳转…' : '千帆详情'}

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

              {o.returnExpressNo && <p>退货物流：{o.returnExpressNo}</p>}

              {o.shipExpressNo && <p>发货物流：{o.shipExpressNo}</p>}

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


