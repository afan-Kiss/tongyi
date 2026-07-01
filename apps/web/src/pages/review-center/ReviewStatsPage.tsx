import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard, PremiumStatCard } from '@/components/premium'
import { reviewCenterApi } from '@/api/endpoints'

export const ReviewStatsPage: React.FC = () => {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await reviewCenterApi.stats()
      setStats(r.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const byScore = (stats?.byScore as Array<{ score: number; count: number }>) || []

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !stats || Number(stats.total) === 0 ? (
        <PremiumCard className="p-6 text-sm text-slate-500">还没有评价数据，先去千帆数据同步评价。</PremiumCard>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PremiumStatCard title="评价总数" value={String(stats.total)} />
            <PremiumStatCard title="待回复" value={String(stats.pendingReplies)} status="warning" />
            <PremiumStatCard title="低分待处理" value={String(stats.negative)} status="warning" />
            <PremiumStatCard title="已处理" value={String(stats.handled)} status="online" />
          </div>
          <PremiumCard className="p-4">
            <h3 className="mb-3 font-medium text-slate-800">分数分布</h3>
            <div className="space-y-2">
              {byScore.map((row) => (
                <div key={row.score} className="flex items-center justify-between text-sm">
                  <span>{row.score} 分</span>
                  <span className="text-slate-500">{row.count} 条</span>
                </div>
              ))}
            </div>
          </PremiumCard>
        </>
      )}
    </div>
  )
}
