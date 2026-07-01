import React, { useCallback, useEffect, useState } from 'react'
import { EmptyState, PremiumCard, SkeletonTable } from '@/components/premium'
import type { ProductAnalysisRowView } from '@/api/types'
import { PeriodPicker, useLivePeriod, liveAnalysisApi } from './liveAnalysisShared'

export const ProductAnalysisPage: React.FC = () => {
  const { period, setPeriod } = useLivePeriod('month')
  const [items, setItems] = useState<ProductAnalysisRowView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await liveAnalysisApi.products(period)
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
        <EmptyState title="暂无商品数据" description="导入带商品名称的订单后，这里会按款汇总" />
      ) : (
        <PremiumCard title="商品分析">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">商品</th>
                  <th className="py-2 pr-3">订单</th>
                  <th className="py-2 pr-3">有效成交</th>
                  <th className="py-2 pr-3">退款</th>
                  <th className="py-2">说明</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.productName} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{row.productName}</td>
                    <td className="py-2 pr-3">{row.orderCount}</td>
                    <td className="py-2 pr-3">¥{row.validAmount.toFixed(0)}</td>
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
