import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GlowBorder, ModuleTile, PremiumCard, PremiumStatCard, SkeletonCard } from '@/components/premium'
import { BarChart3, Calendar, TrendingUp, Users } from 'lucide-react'
import type { LiveAnalysisSummaryView } from '@/api/types'
import { MetricHint, PeriodPicker, useLivePeriod, liveAnalysisApi } from './liveAnalysisShared'

export const LiveAnalysisDashboardPage: React.FC = () => {
  const { period, setPeriod } = useLivePeriod('month')
  const [summary, setSummary] = useState<LiveAnalysisSummaryView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await liveAnalysisApi.summary(period)
      setSummary(r.data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
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
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PremiumStatCard
              title="支付金额"
              value={`¥${summary.grossSalesAmount.toFixed(0)}`}
              hint={summary.caliberNotes.grossSalesAmount}
              status="idle"
            />
            <PremiumStatCard
              title="有效成交"
              value={`¥${summary.validSalesAmount.toFixed(0)}`}
              hint={summary.caliberNotes.validSalesAmount}
              status="online"
            />
            <PremiumStatCard
              title="退款金额"
              value={`¥${summary.refundAmount.toFixed(0)}`}
              hint={summary.caliberNotes.refundAmount}
              status="warning"
            />
            <PremiumStatCard
              title="订单数"
              value={String(summary.orderCount)}
              hint={summary.caliberNotes.orderCount}
              status="idle"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <PremiumStatCard title="直播场次" value={String(summary.sessionCount)} icon={Calendar} />
            <PremiumStatCard title="主播人数" value={String(summary.anchorCount)} icon={Users} />
            <PremiumStatCard title="退款单数" value={String(summary.refundCount)} icon={TrendingUp} status="warning" />
          </div>
        </>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ModuleTile
          title="直播场次"
          description="按场次看成交和退款"
          to="/inventory/live-analysis/sessions"
          icon={Calendar}
          statusLabel="查看列表"
          statusTone="online"
        />
        <ModuleTile
          title="主播榜单"
          description="看谁卖得好、谁要加油"
          to="/inventory/live-analysis/anchors"
          icon={Users}
          statusLabel="看排名"
          statusTone="online"
        />
        <ModuleTile
          title="经营建议"
          description="能直接安排的动作"
          to="/inventory/live-analysis/suggestions"
          icon={BarChart3}
          statusLabel="看建议"
          statusTone="idle"
        />
      </div>

      <GlowBorder>
        <PremiumCard title="数据说明（大白话）">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>
              <strong>支付金额</strong>：顾客付出去的钱，先付后退的单子也算进来。
              <MetricHint text={summary?.caliberNotes.grossSalesAmount ?? ''} />
            </li>
            <li>
              <strong>有效成交</strong>：订单已完成/已签收，且没有正在退或已退成功的售后。
              <MetricHint text="不是用支付金额减去退款简单算的。" />
            </li>
            <li>
              <strong>退款</strong>：有真实退款金额的订单汇总。
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            完整小红书 API 同步将在后续批次迁入；现在可先{' '}
            <Link to="/inventory/live-analysis/import" className="text-[#ff2442] hover:underline">
              导入 CSV
            </Link>{' '}
            或使用旧系统备份查看历史。
          </p>
        </PremiumCard>
      </GlowBorder>
    </div>
  )
}
