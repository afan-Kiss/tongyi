import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { qianfanSyncApi } from '@/api/endpoints'

export const QianfanSyncAfterSalesPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await qianfanSyncApi.afterSales({ page: 1, pageSize: 50 })
      setItems(r.data.items)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">共 {total} 条售后记录</p>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">暂无售后数据。同步后会从千帆后台拉取退款/退货单。</PremiumCard>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white/60">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">售后单号</th>
                <th className="p-3">订单号</th>
                <th className="p-3">类型</th>
                <th className="p-3">状态</th>
                <th className="p-3">退款金额</th>
                <th className="p-3">原因</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id)} className="border-b border-white/50">
                  <td className="p-3 font-mono text-xs">{String(row.afterSaleNo || '—')}</td>
                  <td className="p-3">{String(row.orderNo || '—')}</td>
                  <td className="p-3">{String(row.afterSaleType || '—')}</td>
                  <td className="p-3">{String(row.status || '—')}</td>
                  <td className="p-3">¥{Number(row.refundAmount || 0).toFixed(2)}</td>
                  <td className="p-3 max-w-[240px] truncate">{String(row.reason || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
