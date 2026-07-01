import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { qianfanSyncApi } from '@/api/endpoints'

export const QianfanSyncLivePage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await qianfanSyncApi.liveSessions({ page: 1, pageSize: 50 })
      setItems(r.data.items)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">共 {total} 个直播场次</p>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">
          暂无直播场次。同步后会写入 Raw 表，并汇总到主播分析模块。
        </PremiumCard>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white/60">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">场次</th>
                <th className="p-3">主播</th>
                <th className="p-3">开播</th>
                <th className="p-3">支付金额</th>
                <th className="p-3">有效成交</th>
                <th className="p-3">订单数</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id)} className="border-b border-white/50">
                  <td className="p-3">{String(row.title || row.sessionNo || '—')}</td>
                  <td className="p-3">{String(row.anchorName || '—')}</td>
                  <td className="p-3">{row.startedAt ? new Date(String(row.startedAt)).toLocaleString() : '—'}</td>
                  <td className="p-3">¥{Number(row.grossSalesAmount || 0).toFixed(0)}</td>
                  <td className="p-3">¥{Number(row.validSalesAmount || 0).toFixed(0)}</td>
                  <td className="p-3">{String(row.orderCount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
