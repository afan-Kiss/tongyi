import React from 'react'
import { liveAnalysisApi } from '@/api/endpoints'

const PERIODS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
] as const

export type LivePeriod = (typeof PERIODS)[number]['key']

export function useLivePeriod(defaultPeriod: LivePeriod = 'month') {
  const [period, setPeriod] = React.useState<LivePeriod>(defaultPeriod)
  return { period, setPeriod, periods: PERIODS }
}

export function PeriodPicker({
  period,
  setPeriod,
}: {
  period: LivePeriod
  setPeriod: (p: LivePeriod) => void
}) {
  return (
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
  )
}

export function MetricHint({ text }: { text: string }) {
  return <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{text}</p>
}

export async function loadWithPeriod<T>(period: LivePeriod, loader: (p: LivePeriod) => Promise<T>) {
  return loader(period)
}

export { liveAnalysisApi }
