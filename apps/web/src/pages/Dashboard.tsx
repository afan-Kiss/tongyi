import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type DashboardStats } from '@/lib/api'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'
import { StatCard } from '@/components/ui/StatCard'
import { BraceletDrawer } from '@/components/BraceletDrawer'

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState('')
  const [drawer, setDrawer] = useState<{ open: boolean; certNo: string }>({ open: false, certNo: '' })
  const [bracelet, setBracelet] = useState<Awaited<ReturnType<typeof api.getByCert>>['data'] | null>(null)

  const loadStats = () => {
    api.stats().then((r) => setStats(r.data)).catch((e) => setError(e.message))
  }

  useEffect(() => { loadStats() }, [])

  const openLog = async (certNo: string) => {
    const r = await api.getByCert(certNo)
    setBracelet(r.data)
    setDrawer({ open: true, certNo })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900">经营总览</h2>
        <div className="flex gap-2">
          <Link to="/inventory/inbound?type=register" className="rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600">
            标签入库
          </Link>
          <Link to="/inventory/scan" className="rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] px-4 py-2 text-sm font-semibold text-white">
            去扫码
          </Link>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-dashed border-red-200 bg-red-50/50 p-4 text-sm text-red-700">{error}</div>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard title="在库" value={stats.inStock} hint="点击筛选" onClick={() => navigate('/inventory/stock?filter=inStock')} />
          <StatCard title="已出库" value={stats.outOfStock} hint="点击筛选" accent="from-slate-400 to-slate-300" onClick={() => navigate('/inventory/stock?filter=outStock')} />
          <StatCard title="今日出库" value={stats.todayOutbound} hint="点击筛选" accent="from-amber-400 to-orange-300" onClick={() => navigate('/inventory/stock?filter=todayOutbound')} />
          <StatCard title="今日入库" value={stats.todayInbound} hint="点击筛选" accent="from-emerald-400 to-teal-300" onClick={() => navigate('/inventory/stock?filter=todayInbound')} />
        </div>
      )}

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">最近操作</h3>
        {!stats?.recentLogs?.length && <p className="text-sm text-slate-400">暂无记录</p>}
        <div className="space-y-2">
          {stats?.recentLogs?.map((log, i) => (
            <button
              key={log.id}
              type="button"
              className="board-stagger-item flex w-full items-center justify-between rounded-xl border border-rose-50 bg-rose-50/30 px-3 py-2 text-left text-sm hover:bg-rose-50"
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => openLog(log.certNo)}
            >
              <span className="font-medium text-slate-800">{log.certNo}</span>
              <span className="text-xs text-slate-500">
                {log.opType === 'outbound' ? '出库' : log.opType === 'inbound' ? '入库' : log.opType === 'register' ? '登记' : '新品'}
                {log.reverted ? ' (已撤销)' : ''}
              </span>
            </button>
          ))}
        </div>
      </section>

      <BraceletDrawer
        bracelet={bracelet}
        open={drawer.open}
        onClose={() => setDrawer({ open: false, certNo: '' })}
        onDeleted={(certNo) => {
          const deletedQty = bracelet?.certNo === certNo ? bracelet?.qty : undefined
          setDrawer({ open: false, certNo: '' })
          setBracelet(null)
          setStats((prev) =>
            prev
              ? {
                  ...prev,
                  inStock: deletedQty === 1 ? Math.max(0, prev.inStock - 1) : prev.inStock,
                  outOfStock: deletedQty === 0 ? Math.max(0, prev.outOfStock - 1) : prev.outOfStock,
                  recentLogs: prev.recentLogs.filter((l) => l.certNo !== certNo),
                }
              : prev,
          )
          loadStats()
          emitInventoryRefresh()
        }}
      />
    </div>
  )
}
