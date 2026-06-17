import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type Bracelet, type DashboardStats } from '@/lib/api'
import { isPhotoAsset, mediaThumbUrl } from '@/lib/mediaAsset'
import { BraceletDrawer } from '@/components/BraceletDrawer'
import { onInventoryRefresh } from '@/lib/inventoryRefresh'
import { formatDateTime } from '@/lib/formatDateTime'

export type StockFilter = 'all' | 'inStock' | 'outStock' | 'todayInbound' | 'todayOutbound'

const FILTER_LABELS: Record<StockFilter, string> = {
  all: '全部',
  inStock: '在库',
  outStock: '已出库',
  todayInbound: '今日入库',
  todayOutbound: '今日出库',
}

function parseFilter(raw: string | null): StockFilter {
  if (raw === 'inStock' || raw === 'outStock' || raw === 'todayInbound' || raw === 'todayOutbound') {
    return raw
  }
  return 'all'
}

export const InventoryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = parseFilter(searchParams.get('filter'))
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Bracelet[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [selected, setSelected] = useState<Bracelet | null>(null)
  const [open, setOpen] = useState(false)

  const listParams = useMemo(() => {
    const params: Record<string, string | number> = { q, page: 1, pageSize: 200 }
    if (filter !== 'all') params.filter = filter
    return params
  }, [q, filter])

  const load = () => {
    api.listBracelets(listParams)
      .then((r) => { setItems(r.data.items); setTotal(r.data.total) })
    api.stats().then((r) => setStats(r.data)).catch(() => {})
  }

  useEffect(() => { load() }, [listParams])

  useEffect(() => onInventoryRefresh(load), [listParams])

  const setFilter = (next: StockFilter) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'all') params.delete('filter')
    else params.set('filter', next)
    setSearchParams(params, { replace: true })
  }

  const openItem = async (certNo: string) => {
    const r = await api.getByCert(certNo)
    setSelected(r.data)
    setOpen(true)
  }

  const handleDeleted = (certNo: string) => {
    setItems((prev) => prev.filter((i) => i.certNo !== certNo))
    setTotal((t) => Math.max(0, t - 1))
    setSelected(null)
    setOpen(false)
    load()
  }

  const countHint = filter === 'all' && stats
    ? `共 ${total} 条（在库 ${stats.inStock} · 已出库 ${stats.outOfStock}）`
    : `${FILTER_LABELS[filter]} ${total} 条`

  const filterChips: { key: StockFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'inStock', label: '在库' },
    { key: 'outStock', label: '已出库' },
    { key: 'todayInbound', label: '今日入库' },
    { key: 'todayOutbound', label: '今日出库' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900">库存列表</h2>
        <span className="text-xs text-slate-500">{countHint}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterChips.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === key
                ? 'bg-gradient-to-r from-[#ff2442] to-[#ff6b81] text-white'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[200px] flex-1 rounded-full border border-rose-100 bg-white px-4 py-2 text-sm outline-none focus:border-rose-300"
          placeholder="搜索编号/批次/品类"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="board-stagger-item card-clickable rounded-2xl border border-white/70 bg-white/80 p-4 text-left shadow-sm"
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => openItem(item.certNo)}
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-slate-900">{item.certNo}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${item.qty === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {item.qty === 1 ? '在库' : '已出'}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {item.batch || '—'} · 圈口 {item.ringSize || '—'} · {item.category || '—'}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">添加 {formatDateTime(item.createdAt)}</p>
            {(item.mediaAssets?.length || item._count?.mediaAssets) ? (
              <div className="mt-2">
                {item.mediaAssets && item.mediaAssets.filter(isPhotoAsset).length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {item.mediaAssets.filter(isPhotoAsset).slice(0, 4).map((asset) => (
                      <img
                        key={asset.id}
                        src={mediaThumbUrl(asset)}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-xl border border-rose-100 object-cover"
                        loading="lazy"
                      />
                    ))}
                    {item._count && item._count.mediaAssets > item.mediaAssets.filter(isPhotoAsset).length && (
                      <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-rose-100 bg-rose-50/50 text-[10px] text-rose-500">
                        +{item._count.mediaAssets - item.mediaAssets.filter(isPhotoAsset).length}
                      </span>
                    )}
                  </div>
                ) : item._count && item._count.mediaAssets > 0 ? (
                  <p className="text-[10px] text-rose-500">{item._count.mediaAssets} 个媒体文件</p>
                ) : null}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {!items.length && (
        <p className="py-8 text-center text-sm text-slate-400">暂无符合条件的记录</p>
      )}

      <BraceletDrawer
        bracelet={selected}
        open={open}
        onClose={() => setOpen(false)}
        onDeleted={handleDeleted}
        onUpdated={(b) => { setSelected(b); load() }}
        showLabelPrint
      />
    </div>
  )
}
