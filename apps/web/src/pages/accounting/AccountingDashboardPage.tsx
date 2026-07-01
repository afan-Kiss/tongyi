import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { accountingApi } from '@/api/endpoints'
import { GlowBorder, PremiumCard, PremiumStatCard, SkeletonCard } from '@/components/premium'
import type { AccountingSummaryView } from '@/api/types'

const PERIODS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
] as const

export const AccountingDashboardPage: React.FC = () => {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['key']>('today')
  const [summary, setSummary] = useState<AccountingSummaryView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await accountingApi.summary(period)
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
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            className={[
              'rounded-full px-3 py-1 text-sm',
              period === p.key ? 'bg-slate-800 text-white' : 'bg-white/70 text-slate-600',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>

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
            <PremiumStatCard title="收入" value={`¥${summary.incomeTotal.toFixed(2)}`} status="online" />
            <PremiumStatCard title="支出" value={`¥${summary.expenseTotal.toFixed(2)}`} status="warning" />
            <PremiumStatCard title="返现" value={`¥${summary.cashbackTotal.toFixed(2)}`} status="idle" />
            <PremiumStatCard title="退款" value={`¥${summary.refundTotal.toFixed(2)}`} status="error" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <PremiumStatCard title="待处理" value={String(summary.pendingCount)} status="warning" />
            <PremiumStatCard title="已处理" value={String(summary.handledCount)} status="online" />
          </div>
        </>
      ) : null}

      <GlowBorder>
        <PremiumCard title="快捷操作">
          <div className="flex flex-wrap gap-3">
            <Link to="/inventory/accounting/expense" className="text-sm text-[#ff2442] hover:underline">
              新增支出
            </Link>
            <Link to="/inventory/accounting/cashback" className="text-sm text-[#ff2442] hover:underline">
              新增返现
            </Link>
            <Link to="/inventory/accounting/transactions" className="text-sm text-[#ff2442] hover:underline">
              查看流水
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            新增支出/返现后，若填写了订单号或物流单号，会自动生成扫码提醒；员工在扫码页点「已处理」会同步更新记账状态。
          </p>
        </PremiumCard>
      </GlowBorder>
    </div>
  )
}
