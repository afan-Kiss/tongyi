import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { qianfanSyncApi } from '@/api/endpoints'

export const QianfanSyncReviewsPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await qianfanSyncApi.reviews({ page: 1, pageSize: 50 })
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
      <p className="text-xs text-slate-500">共 {total} 条评价</p>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">暂无评价数据。Cookie 可用后同步评价列表。</PremiumCard>
      ) : (
        <div className="space-y-2">
          {items.map((row) => (
            <PremiumCard key={String(row.id)} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-slate-800">{String(row.buyerName || '买家')}</div>
                <div className="text-sm text-amber-600">{row.score != null ? `${row.score} 分` : '—'}</div>
              </div>
              <p className="mt-2 text-sm text-slate-600">{String(row.content || '（无文字评价）')}</p>
              <p className="mt-2 text-xs text-slate-400">
                订单 {String(row.orderNo || '—')} · 回复 {String(row.replyStatus || '—')}
              </p>
            </PremiumCard>
          ))}
        </div>
      )}
    </div>
  )
}
