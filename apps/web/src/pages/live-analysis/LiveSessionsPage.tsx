import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, PremiumButton, PremiumCard, SkeletonTable } from '@/components/premium'
import type { LiveSessionView } from '@/api/types'
import { PeriodPicker, useLivePeriod, liveAnalysisApi } from './liveAnalysisShared'

export const LiveSessionsPage: React.FC = () => {
  const { period, setPeriod } = useLivePeriod('month')
  const [items, setItems] = useState<LiveSessionView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await liveAnalysisApi.sessions({ period, page: 1, pageSize: 50 })
      setItems(r.data.items)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <PremiumButton variant="secondary" onClick={() => void load()}>
          刷新
        </PremiumButton>
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : items.length === 0 ? (
        <EmptyState
          title="还没有直播场次"
          description="可以先导入 CSV，或从旧主播分析系统查看历史数据"
          action={
            <a href="/inventory/live-analysis/import" className="text-sm text-[#ff2442] hover:underline">
              去导入数据
            </a>
          }
        />
      ) : (
        <PremiumCard title={`直播场次（共 ${total} 场）`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">场次</th>
                  <th className="py-2 pr-3">主播</th>
                  <th className="py-2 pr-3">开播</th>
                  <th className="py-2 pr-3">有效成交</th>
                  <th className="py-2 pr-3">退款</th>
                  <th className="py-2">说明</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <Link to={`/inventory/live-analysis/sessions/${row.id}`} className="text-[#ff2442] hover:underline">
                        {row.sessionNo}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{row.anchorDisplayName}</td>
                    <td className="py-2 pr-3 text-xs">{new Date(row.startedAt).toLocaleString('zh-CN')}</td>
                    <td className="py-2 pr-3">¥{row.validSalesAmount.toFixed(0)}</td>
                    <td className="py-2 pr-3">¥{row.refundAmount.toFixed(0)}</td>
                    <td className="py-2 text-xs text-slate-500">{row.plainSummary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      )}
    </div>
  )
}
