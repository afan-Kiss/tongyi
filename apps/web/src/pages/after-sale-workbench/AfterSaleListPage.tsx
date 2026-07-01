import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { afterSaleWorkbenchApi } from '@/api/endpoints'
import { AfterSaleCard, markAfterSaleHandled, markAfterSaleIgnored } from './afterSaleShared'

export const AfterSaleListPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [rawOpen, setRawOpen] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await afterSaleWorkbenchApi.items({ page: 1, pageSize: 50 })
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
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">还没有同步到售后，去千帆数据里点立即同步。</PremiumCard>
      ) : (
        items.map((row) => (
          <AfterSaleCard
            key={String(row.id)}
            row={row}
            onShowRaw={setRawOpen}
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
      {rawOpen ? (
        <PremiumCard className="p-4">
          <div className="mb-2 flex justify-between">
            <h3 className="font-medium">原始 JSON</h3>
            <button type="button" onClick={() => setRawOpen(null)} className="text-sm text-slate-500">
              关闭
            </button>
          </div>
          <pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(rawOpen.raw || rawOpen, null, 2)}</pre>
        </PremiumCard>
      ) : null}
    </div>
  )
}
