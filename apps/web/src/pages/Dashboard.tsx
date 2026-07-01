import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, platformApi, type DashboardStats } from '@/lib/api'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'
import { BraceletDrawer } from '@/components/BraceletDrawer'
import { OperationLogList } from '@/components/OperationLogList'
import { BreathingDot, PremiumCard, PremiumStatCard } from '@/components/premium'

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [platform, setPlatform] = useState<Awaited<ReturnType<typeof platformApi.portalOverview>>['data'] | null>(null)
  const [error, setError] = useState('')
  const [drawer, setDrawer] = useState<{ open: boolean; certNo: string }>({ open: false, certNo: '' })
  const [bracelet, setBracelet] = useState<Awaited<ReturnType<typeof api.getByCert>>['data'] | null>(null)

  const loadStats = () => {
    api.stats().then((r) => setStats(r.data)).catch((e) => setError(e.message))
    platformApi.portalOverview().then((r) => setPlatform(r.data)).catch(() => {})
  }

  useEffect(() => { loadStats() }, [])

  const openLog = async (certNo: string) => {
    const r = await api.getByCert(certNo)
    setBracelet(r.data)
    setDrawer({ open: true, certNo })
  }

  return (
    <div className="premium-page-bg premium-enter space-y-4">
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

      {platform ? (
        <PremiumCard title="系统运行状态" subtitle="旁路模块状态，失败不影响扫码">
          <div className="flex flex-wrap gap-4 text-sm">
            <BreathingDot tone={platform.agent.hasOnlineAgent ? 'online' : 'warning'} label={`本地助手：${platform.agent.hasOnlineAgent ? '在线' : '离线'}`} />
            <BreathingDot tone={platform.qianfan?.running ? 'online' : 'idle'} label={`千帆：${platform.qianfan?.running ? '运行中' : '未启动'}`} />
            <BreathingDot tone={platform.accounting.online ? 'online' : 'idle'} label={`记账：${platform.accounting.url ? (platform.accounting.online ? '正常' : '离线') : '未配置'}`} />
            <BreathingDot tone={platform.liveAnalysis.online ? 'online' : 'idle'} label={`主播分析：${platform.liveAnalysis.url ? (platform.liveAnalysis.online ? '正常' : '离线') : '未配置'}`} />
          </div>
        </PremiumCard>
      ) : null}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <PremiumStatCard title="在库" value={stats.inStock} hint="点击筛选" onClick={() => navigate('/inventory/stock?filter=inStock')} />
          <PremiumStatCard title="已出库" value={stats.outOfStock} hint="点击筛选" accent="from-slate-400 to-slate-300" onClick={() => navigate('/inventory/stock?filter=outStock')} />
          <PremiumStatCard title="今日出库" value={stats.todayOutbound} hint="点击筛选" accent="from-amber-400 to-orange-300" onClick={() => navigate('/inventory/stock?filter=todayOutbound')} />
          <PremiumStatCard title="今日入库" value={stats.todayInbound} hint="点击筛选" accent="from-emerald-400 to-teal-300" onClick={() => navigate('/inventory/stock?filter=todayInbound')} />
        </div>
      )}

      {stats && (stats.todayOutboundLogs?.length || stats.todayOutbound > 0) ? (
        <PremiumCard title="今日出库明细">
          <OperationLogList logs={stats.todayOutboundLogs || []} emptyText="今日暂无出库" onOpen={openLog} />
        </PremiumCard>
      ) : null}

      {stats && (stats.todayInboundLogs?.length || stats.todayInbound > 0) ? (
        <PremiumCard title="今日入库明细">
          <OperationLogList logs={stats.todayInboundLogs || []} emptyText="今日暂无入库" onOpen={openLog} />
        </PremiumCard>
      ) : null}

      <PremiumCard title="最近操作">
        <OperationLogList logs={stats?.recentLogs || []} emptyText="暂无记录" onOpen={openLog} />
      </PremiumCard>

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
                  todayOutboundLogs: prev.todayOutboundLogs?.filter((l) => l.certNo !== certNo),
                  todayInboundLogs: prev.todayInboundLogs?.filter((l) => l.certNo !== certNo),
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
