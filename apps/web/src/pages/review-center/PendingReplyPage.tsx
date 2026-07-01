import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { reviewCenterApi } from '@/api/endpoints'
import { ReviewCard, markReviewHandled, markReviewIgnored } from './reviewCenterShared'

export const PendingReplyPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await reviewCenterApi.pendingReplies({ page: 1, pageSize: 50 })
      setItems(r.data.items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">暂无待回复评价。</PremiumCard>
      ) : (
        items.map((row) => (
          <ReviewCard
            key={String(row.id)}
            row={row}
            onHandled={async (id) => {
              await markReviewHandled(id)
              await load()
            }}
            onIgnored={async (id) => {
              await markReviewIgnored(id)
              await load()
            }}
          />
        ))
      )}
    </div>
  )
}
