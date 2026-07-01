import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PremiumCard, PremiumStatCard, SkeletonCard } from '@/components/premium'
import { reviewCenterApi } from '@/api/endpoints'
import { Star } from 'lucide-react'

export const ReviewCenterDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Awaited<ReturnType<typeof reviewCenterApi.overview>>['data'] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await reviewCenterApi.overview()
      setData(r.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : data ? (
        <>
          <p className="text-sm text-slate-500">{data.hint}</p>
          {data.totalReviews === 0 ? (
            <PremiumCard className="p-6 text-sm text-slate-500">
              还没有同步到评价，去{' '}
              <Link to="/inventory/qianfan-sync" className="text-[#ff2442] hover:underline">
                千帆数据
              </Link>{' '}
              里点立即同步。
            </PremiumCard>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PremiumStatCard title="今日新增评价" value={String(data.reviewsToday)} icon={Star} />
                <PremiumStatCard title="待回复评价" value={String(data.pendingReplies)} status="warning" />
                <PremiumStatCard title="低分评价" value={String(data.negativeCount)} status="warning" />
                <PremiumStatCard title="好评率" value={`${data.goodRate}%`} status="online" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/inventory/review-center/pending" className="rounded-full bg-white/80 px-4 py-2 text-sm hover:bg-white">
                  查看待回复
                </Link>
                <Link to="/inventory/review-center/negative" className="rounded-full bg-white/80 px-4 py-2 text-sm hover:bg-white">
                  查看低分评价
                </Link>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
