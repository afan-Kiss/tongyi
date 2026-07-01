import React, { useCallback, useEffect, useState } from 'react'
import { EmptyState, PremiumCard, SkeletonTable } from '@/components/premium'
import type { AnchorRankingRowView } from '@/api/types'
import { PeriodPicker, useLivePeriod, liveAnalysisApi } from './liveAnalysisShared'

export const AnchorRankingPage: React.FC = () => {
  const { period, setPeriod } = useLivePeriod('month')
  const [items, setItems] = useState<AnchorRankingRowView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await liveAnalysisApi.anchorRanking(period)
      setItems(r.data.items)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <PeriodPicker period={period} setPeriod={setPeriod} />
      {loading ? (
        <SkeletonTable rows={5} />
      ) : items.length === 0 ? (
        <EmptyState title="暂无主播数据" description="导入直播数据后，这里会按有效成交排名" />
      ) : (
        <PremiumCard title="主播榜单（按有效成交）">
          <p className="mb-3 text-xs text-slate-500">排名看有效成交，不是看谁喊得响。退款高的会单独提示，方便一起改进。</p>
          <div className="space-y-3">
            {items.map((row) => (
              <div
                key={row.anchorName}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-white/60 p-3"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    #{row.rank} {row.anchorName}
                    <span className="ml-2 text-sm font-normal text-slate-500">{row.sessionCount} 场</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{row.plainSummary}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium text-[#ff2442]">¥{row.validSalesAmount.toFixed(0)}</p>
                  <p className="text-xs text-slate-500">退款 ¥{row.refundAmount.toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        </PremiumCard>
      )}
    </div>
  )
}
