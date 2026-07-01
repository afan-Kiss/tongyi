import React, { useCallback, useEffect, useState } from 'react'
import { platformApi } from '@/api/endpoints'
import { StatCard } from '@/components/ui/StatCard'

export const SystemStatusPage: React.FC = () => {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof platformApi.portalOverview>>['data'] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const r = await platformApi.portalOverview()
      setOverview(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 10000)
    return () => clearInterval(timer)
  }, [load])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">系统状态</h2>
        <p className="text-sm text-slate-500">各模块运行概况；任何子系统失败都不应影响扫码出库</p>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              title="库存/扫码"
              value={overview.inventory.degraded ? '部分异常' : '正常'}
              hint={overview.inventory.degradedReasons?.join('；') || '核心功能优先'}
              accent={overview.inventory.degraded ? 'from-amber-400 to-orange-300' : 'from-emerald-400 to-teal-300'}
            />
            <StatCard
              title="本地助手"
              value={overview.agent.hasOnlineAgent ? '在线' : '离线'}
              hint={overview.agent.summary}
              accent={overview.agent.hasOnlineAgent ? 'from-sky-400 to-blue-300' : 'from-amber-400 to-orange-300'}
            />
            <StatCard
              title="千帆客服"
              value={overview.qianfan?.running ? '运行中' : '未启动'}
              hint={overview.qianfan?.plainSummary || '—'}
              accent={overview.qianfan?.listenerReady ? 'from-emerald-400 to-teal-300' : 'from-slate-400 to-slate-300'}
            />
            <StatCard
              title="Excel 桥接"
              value={overview.inventory.excelBridge?.online ? '在线' : '离线'}
              hint={overview.inventory.excelBridge?.message || '—'}
              accent={overview.inventory.excelBridge?.online ? 'from-emerald-400 to-teal-300' : 'from-amber-400 to-orange-300'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">记账系统</h3>
              <p className="text-sm text-slate-600">{overview.accounting.plainMessage}</p>
              <p className="mt-1 text-xs text-slate-400">{overview.accounting.url || '未配置 JIZHANG_WEB_URL'}</p>
            </section>
            <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">主播分析</h3>
              <p className="text-sm text-slate-600">{overview.liveAnalysis.plainMessage}</p>
              <p className="mt-1 text-xs text-slate-400">{overview.liveAnalysis.url || '未配置 ZHUBO_ANALYSIS_WEB_URL'}</p>
            </section>
          </div>

          {overview.recentErrors?.length ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-amber-900">最近异常（大白话）</h3>
              <ul className="space-y-2 text-sm text-amber-900">
                {overview.recentErrors.map((item, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{item.module}：</span>{item.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-800">
              当前没有需要紧急处理的系统异常。
            </section>
          )}
        </>
      )}
    </div>
  )
}
