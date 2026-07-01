import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Calculator,
  Database,
  Headphones,
  Image,
  MonitorCog,
  Package,
  Printer,
  Server,
  BarChart3,
} from 'lucide-react'
import { platformApi } from '@/api/endpoints'
import {
  GlowBorder,
  HealthOrb,
  ModuleTile,
  PremiumButton,
  PremiumCard,
  PremiumPage,
  SkeletonCard,
  TimelinePanel,
  type TimelineItem,
} from '@/components/premium'

function toneFromOnline(online?: boolean): 'online' | 'warning' | 'error' | 'idle' {
  if (online === true) return 'online'
  if (online === false) return 'warning'
  return 'idle'
}

export const SystemStatusPage: React.FC = () => {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof platformApi.portalOverview>>['data'] | null>(null)
  const [discovery, setDiscovery] = useState<Awaited<ReturnType<typeof platformApi.discoverySiblings>>['data'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const r = await platformApi.portalOverview()
      setOverview(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 10000)
    return () => clearInterval(timer)
  }, [load])

  const scanSiblings = async () => {
    setScanning(true)
    setMsg('')
    try {
      const r = await platformApi.discoverySiblings()
      setDiscovery(r.data)
      setMsg(r.data.message)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '扫描失败')
    } finally {
      setScanning(false)
    }
  }

  const applyDiscovery = async (overwrite = false) => {
    if (!discovery?.systems?.length) return
    setApplying(true)
    try {
      const paths = discovery.systems.reduce<Record<string, string>>((acc, sys) => {
        if (sys.key === 'qianfan' && sys.suggestedEnv?.QIANFAN_RELAY_ROOT) acc.qianfanRelayRoot = sys.suggestedEnv.QIANFAN_RELAY_ROOT
        if (sys.key === 'jizhang' && sys.suggestedEnv?.JIZHANG_WEB_URL) acc.jizhangWebUrl = sys.suggestedEnv.JIZHANG_WEB_URL
        if (sys.key === 'zhubo' && sys.suggestedEnv?.ZHUBO_ANALYSIS_WEB_URL) acc.zhuboAnalysisWebUrl = sys.suggestedEnv.ZHUBO_ANALYSIS_WEB_URL
        return acc
      }, {})
      const r = await platformApi.discoveryApply({ confirm: true, overwrite, paths })
      setMsg(r.message || r.data.hint)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '应用失败')
    } finally {
      setApplying(false)
    }
  }

  const healthScore = useMemo(() => {
    if (!overview) return 0
    let score = 100
    if (overview.inventory.degraded) score -= 15
    if (!overview.agent.hasOnlineAgent) score -= 10
    if (!overview.qianfan?.listenerReady) score -= 10
    if (!overview.accounting.online && overview.accounting.url) score -= 5
    if (!overview.liveAnalysis.online && overview.liveAnalysis.url) score -= 5
    return Math.max(0, score)
  }, [overview])

  const errorTimeline: TimelineItem[] = useMemo(
    () =>
      (overview?.recentErrors || []).map((item, idx) => ({
        id: `err-${idx}`,
        title: item.module,
        subtitle: item.message,
        time: item.at ? new Date(item.at).toLocaleString() : undefined,
        tone: 'error',
      })),
    [overview?.recentErrors],
  )

  const runtime = overview?.runtimeMode

  return (
    <PremiumPage title="系统状态" subtitle="各模块运行概况。任何子系统失败都不应影响扫码出库。">
      {error ? <PremiumCard tone="danger"><p className="text-sm text-red-700">{error}</p></PremiumCard> : null}
      {msg ? <PremiumCard tone="info"><p className="text-sm text-sky-800">{msg}</p></PremiumCard> : null}

      {loading && !overview ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <PremiumCard className="flex flex-col items-center justify-center py-6" tone={healthScore >= 80 ? 'ok' : 'warn'}>
              <HealthOrb value={`${healthScore}%`} label="整体健康度" tone={healthScore >= 80 ? 'ok' : healthScore >= 50 ? 'warn' : 'error'} size="lg" />
            </PremiumCard>

            {runtime ? (
              <GlowBorder tone={runtime.mode === 'local' ? 'ok' : runtime.mode === 'mixed' ? 'info' : 'warn'} innerClassName="p-4">
                <div className="text-sm font-semibold text-slate-800">当前运行模式 · {runtime.label}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{runtime.description}</p>
              </GlowBorder>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <ModuleTile title="库存 / 扫码" description="核心出入库功能，优先级最高" to="/inventory/scan" statusLabel={overview.inventory.degraded ? '部分异常' : '正常'} statusTone={overview.inventory.degraded ? 'warning' : 'online'} icon={Package} />
            <ModuleTile title="千帆客服" description={overview.qianfan?.plainSummary || '监听四店买家消息'} to="/inventory/qianfan" statusLabel={overview.qianfan?.running ? '运行中' : '未启动'} statusTone={overview.qianfan?.listenerReady ? 'online' : 'warning'} icon={Headphones} />
            <ModuleTile title="经营记账" description={overview.accounting.plainMessage} to="/inventory/accounting" statusLabel={overview.accounting.url ? (overview.accounting.online ? '在线' : '离线') : '未配置'} statusTone={toneFromOnline(overview.accounting.online)} icon={Calculator} />
            <ModuleTile title="主播分析" description={overview.liveAnalysis.plainMessage} to="/inventory/live-analysis" statusLabel={overview.liveAnalysis.url ? (overview.liveAnalysis.online ? '在线' : '离线') : '未配置'} statusTone={toneFromOnline(overview.liveAnalysis.online)} icon={BarChart3} />
            <ModuleTile title="本地助手" description={overview.agent.summary} to="/inventory/agents" statusLabel={overview.agent.hasOnlineAgent ? '在线' : '离线'} statusTone={overview.agent.hasOnlineAgent ? 'online' : 'warning'} icon={MonitorCog} />
            <ModuleTile title="Excel 桥接" description={overview.inventory.excelBridge?.message || '本地 Excel 同步'} statusLabel={overview.inventory.excelBridge?.online ? '在线' : '离线'} statusTone={toneFromOnline(overview.inventory.excelBridge?.online)} icon={Server} />
            <ModuleTile title="打印 Agent" description={overview.inventory.printAgent?.message || '标签/吊牌打印'} statusLabel={overview.inventory.printAgent?.online ? '在线' : '离线'} statusTone={toneFromOnline(overview.inventory.printAgent?.online)} icon={Printer} />
            <ModuleTile title="图片上传" description="货号图片、手机拍照、媒体中心" to="/inventory/settings" statusLabel="可用" statusTone="online" icon={Image} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PremiumCard title="服务器 / 数据库" subtitle="主系统 API 与 SQLite 数据库">
              <div className="grid grid-cols-2 gap-3">
                <ModuleTile title="服务器" description="Express + 前端静态" statusLabel="运行中" statusTone="online" icon={Server} />
                <ModuleTile title="数据库" description="SQLite / Prisma" statusLabel="正常" statusTone="online" icon={Database} />
              </div>
            </PremiumCard>

            <PremiumCard title="最近异常" tone={errorTimeline.length ? 'warn' : 'ok'}>
              {errorTimeline.length ? (
                <TimelinePanel title="" items={errorTimeline} emptyTitle="" />
              ) : (
                <p className="text-sm text-emerald-700">当前没有需要紧急处理的系统异常。</p>
              )}
            </PremiumCard>
          </div>

          <PremiumCard title="同目录系统发现" subtitle="仅本地模式可用。云服务器请使用本地助手上报路径。" tone="info">
            <div className="mb-3 flex flex-wrap gap-2">
              <PremiumButton variant="secondary" loading={scanning} onClick={() => void scanSiblings()}>
                <Activity size={14} /> 扫描同目录
              </PremiumButton>
              <PremiumButton variant="primary" loading={applying} disabled={!discovery?.systems?.length} onClick={() => void applyDiscovery(false)}>
                一键应用路径
              </PremiumButton>
              <PremiumButton variant="ghost" loading={applying} disabled={!discovery?.systems?.length} onClick={() => void applyDiscovery(true)}>
                覆盖已有配置
              </PremiumButton>
            </div>
            {discovery ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-500">{discovery.message} · {discovery.baseDir}</p>
                {discovery.systems.length ? discovery.systems.map((sys) => (
                  <GlowBorder key={`${sys.key}-${sys.path}`} tone="info" innerClassName="p-3 text-sm">
                    <div className="font-medium text-slate-800">{sys.name} · 置信度 {sys.confidence}%</div>
                    <div className="mt-1 text-xs text-slate-500">{sys.path}</div>
                    <div className="mt-1 text-xs text-slate-600">{sys.reason}</div>
                  </GlowBorder>
                )) : (
                  <p className="text-sm text-slate-500">暂未识别到候选系统。</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">点击扫描，自动识别千帆、记账、主播分析等同目录项目。</p>
            )}
          </PremiumCard>
        </>
      ) : null}
    </PremiumPage>
  )
}
