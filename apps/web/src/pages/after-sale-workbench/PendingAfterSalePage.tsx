import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { afterSaleWorkbenchApi } from '@/api/endpoints'
import { AfterSaleCard, markAfterSaleHandled, markAfterSaleIgnored } from './afterSaleShared'

export const PendingAfterSalePage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await afterSaleWorkbenchApi.pending({ page: 1, pageSize: 50 })
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
      <p className="text-sm text-slate-500">以下售后建议今天跟进，退款类请同步确认财务。</p>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">暂无待处理售后，很好。</PremiumCard>
      ) : (
        items.map((row) => (
          <AfterSaleCard
            key={String(row.id)}
            row={row}
            onHandled={async (id) => {
              await markAfterSaleHandled(id)
              await load()
            }}
            onIgnored={async (id) => {
              await markAfterSaleIgnored(id)
              await load()
            }}
          />
        ))
      )}
    </div>
  )
}
