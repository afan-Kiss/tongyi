import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { reviewCenterApi } from '@/api/endpoints'
import { ReviewCard, markReviewHandled, markReviewIgnored } from './reviewCenterShared'

export const NegativeReviewPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await reviewCenterApi.negative({ page: 1, pageSize: 50 })
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
      <p className="text-sm text-slate-500">低分评价需要尽快处理，先安抚客户，再核对订单问题。</p>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">暂无低分评价，继续保持。</PremiumCard>
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
