import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PremiumCard, PremiumStatCard, SkeletonCard } from '@/components/premium'
import { afterSaleWorkbenchApi } from '@/api/endpoints'
import { LifeBuoy } from 'lucide-react'

export const AfterSaleDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Awaited<ReturnType<typeof afterSaleWorkbenchApi.overview>>['data'] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await afterSaleWorkbenchApi.overview()
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
          {data.totalItems === 0 ? (
            <PremiumCard className="p-6 text-sm text-slate-500">
              还没有同步到售后，去{' '}
              <Link to="/inventory/qianfan-sync" className="text-[#ff2442] hover:underline">
                千帆数据
              </Link>{' '}
              里点立即同步。
            </PremiumCard>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PremiumStatCard title="待处理（今日同步）" value={String(data.pendingToday)} icon={LifeBuoy} status="warning" />
                <PremiumStatCard title="退款单" value={String(data.refundCount)} />
                <PremiumStatCard title="待确认退款金额" value={`¥${data.pendingRefundAmount.toFixed(0)}`} status="warning" />
                <PremiumStatCard title="财务待确认" value={String(data.financePendingCount)} status="warning" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/inventory/after-sales/pending" className="rounded-full bg-white/80 px-4 py-2 text-sm">
                  查看待处理
                </Link>
                <Link to="/inventory/after-sales/refunds" className="rounded-full bg-white/80 px-4 py-2 text-sm">
                  查看退款单
                </Link>
                <Link to="/inventory/accounting" className="rounded-full bg-white/80 px-4 py-2 text-sm">
                  去经营记账
                </Link>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  )
}
