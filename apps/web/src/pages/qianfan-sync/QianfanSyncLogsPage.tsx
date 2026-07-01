import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { qianfanSyncApi } from '@/api/endpoints'

export const QianfanSyncLogsPage: React.FC = () => {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await qianfanSyncApi.logs({ page: 1, pageSize: 100 })
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
      <button type="button" onClick={() => void load()} className="rounded-full bg-white/80 px-4 py-2 text-sm">
        刷新
      </button>
      {loading ? (
        <p className="text-sm text-slate-500">加载中…</p>
      ) : !items.length ? (
        <PremiumCard className="p-6 text-sm text-slate-500">暂无同步日志。执行同步后会在此显示大白话结果。</PremiumCard>
      ) : (
        <div className="space-y-2">
          {items.map((row) => (
            <PremiumCard key={String(row.id)} className="p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '—'}</span>
                <span>{String(row.shopName || '全店')}</span>
                <span
                  className={[
                    'rounded px-1.5 py-0.5',
                    row.level === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  {String(row.level || 'info')}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{String(row.message || '')}</p>
            </PremiumCard>
          ))}
        </div>
      )}
    </div>
  )
}
