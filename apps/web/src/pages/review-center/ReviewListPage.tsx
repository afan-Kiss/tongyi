import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { reviewCenterApi } from '@/api/endpoints'
import { ReviewCard, markReviewHandled, markReviewIgnored } from './reviewCenterShared'

export const ReviewListPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await reviewCenterApi.reviews({ page: 1, pageSize: 50 })
      setItems(r.data.items)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handle = async (id: string) => {
    await markReviewHandled(id)
    await load()
  }
  const ignore = async (id: string) => {
    await markReviewIgnored(id)
    await load()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">共 {total} 条评价</p>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">还没有同步到评价，去千帆数据里点立即同步。</PremiumCard>
      ) : (
        <div className="space-y-2">
          {items.map((row) => (
            <ReviewCard key={String(row.id)} row={row} onHandled={handle} onIgnored={ignore} />
          ))}
        </div>
      )}
    </div>
  )
}
