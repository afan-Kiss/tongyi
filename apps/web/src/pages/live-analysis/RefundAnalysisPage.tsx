import React, { useCallback, useEffect, useState } from 'react'
import { EmptyState, PremiumCard, PremiumStatCard, SkeletonTable } from '@/components/premium'
import type { RefundAnalysisRowView } from '@/api/types'
import { PeriodPicker, useLivePeriod, liveAnalysisApi } from './liveAnalysisShared'

export const RefundAnalysisPage: React.FC = () => {
  const { period, setPeriod } = useLivePeriod('month')
  const [items, setItems] = useState<RefundAnalysisRowView[]>([])
  const [totalRefund, setTotalRefund] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await liveAnalysisApi.refunds(period)
      setItems(r.data.items)
      setTotalRefund(r.data.totalRefund)
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
      <PremiumStatCard title="退款合计" value={`¥${totalRefund.toFixed(0)}`} status="warning" hint="有退款金额的订单汇总" />
      {loading ? (
        <SkeletonTable rows={5} />
      ) : items.length === 0 ? (
        <EmptyState title="本期没有退款记录" description="这是好事！有数据后会按订单列出" />
      ) : (
        <PremiumCard title="退款明细">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">订单</th>
                  <th className="py-2 pr-3">主播</th>
                  <th className="py-2 pr-3">商品</th>
                  <th className="py-2 pr-3">退款</th>
                  <th className="py-2">售后状态</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.orderNo} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{row.orderNo}</td>
                    <td className="py-2 pr-3">{row.anchorName}</td>
                    <td className="py-2 pr-3">{row.productName || '—'}</td>
                    <td className="py-2 pr-3 text-[#ff2442]">¥{row.refundAmount.toFixed(2)}</td>
                    <td className="py-2 text-xs">{row.afterSaleStatus || '—'}</td>
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
