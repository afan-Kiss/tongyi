import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { qianfanSyncApi } from '@/api/endpoints'

export const QianfanSyncOrdersPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rawOpen, setRawOpen] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await qianfanSyncApi.orders({ page: 1, pageSize: 50, q })
      setItems(r.data.items)
      setTotal(r.data.total)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [q])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索订单号/买家/商品"
          className="rounded-xl border border-white/60 bg-white/70 px-3 py-2 text-sm"
        />
        <button type="button" onClick={() => void load()} className="rounded-full bg-slate-800 px-4 py-2 text-sm text-white">
          查询
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-xs text-slate-500">共 {total} 条（无数据时显示空列表，不会展示假数据）</p>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">暂无订单数据。Cookie 可用后点击「立即同步」拉取千帆后台订单。</PremiumCard>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white/60">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">订单号</th>
                <th className="p-3">店铺</th>
                <th className="p-3">买家</th>
                <th className="p-3">商品</th>
                <th className="p-3">支付</th>
                <th className="p-3">状态</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id)} className="border-b border-white/50">
                  <td className="p-3 font-mono text-xs">{String(row.orderNo || '—')}</td>
                  <td className="p-3">{String(row.shopName || '—')}</td>
                  <td className="p-3">{String(row.buyerName || '—')}</td>
                  <td className="p-3 max-w-[200px] truncate">{String(row.productTitle || '—')}</td>
                  <td className="p-3">¥{Number(row.payAmount || 0).toFixed(2)}</td>
                  <td className="p-3">{String(row.orderStatus || '—')}</td>
                  <td className="p-3">
                    <button type="button" className="text-[#ff2442]" onClick={() => setRawOpen(row)}>
                      原始数据
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rawOpen ? (
        <PremiumCard className="p-4">
          <div className="mb-2 flex justify-between">
            <h3 className="font-medium">原始 JSON</h3>
            <button type="button" onClick={() => setRawOpen(null)} className="text-sm text-slate-500">
              关闭
            </button>
          </div>
          <pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(rawOpen.raw || rawOpen, null, 2)}</pre>
        </PremiumCard>
      ) : null}
    </div>
  )
}
