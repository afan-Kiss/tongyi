import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { SkeletonBlock } from './SkeletonBlock'
import type { StatusTone } from './StatusPulse'
import { StatusPulse } from './StatusPulse'

export const PremiumPage: React.FC<{
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}> = ({ title, subtitle, actions, className = '', children }) => (
  <div className={`premium-page-bg premium-enter space-y-4 ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    {children}
  </div>
)

export const PremiumStatCard: React.FC<{
  title: string
  value: React.ReactNode
  unit?: string
  hint?: string
  status?: StatusTone
  icon?: LucideIcon
  accent?: string
  loading?: boolean
  onClick?: () => void
}> = ({ title, value, unit, hint, status, icon: Icon, accent = 'from-rose-500 to-pink-400', loading, onClick }) => {
  if (loading) {
    return (
      <div className="premium-glass rounded-2xl p-4">
        <SkeletonBlock className="mb-2 h-3 w-16" />
        <SkeletonBlock className="h-8 w-24" />
      </div>
    )
  }
  return (
    <div
      className={`premium-stat-card premium-topline premium-glass premium-glass-hover relative overflow-hidden rounded-2xl p-4 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ ['--premium-topline-gradient' as string]: `linear-gradient(90deg, var(--tw-gradient-stops))` }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">{title}</p>
        <div className="flex items-center gap-1.5">
          {status ? <StatusPulse tone={status} /> : null}
          {Icon ? <Icon size={16} className="text-slate-400" /> : null}
        </div>
      </div>
      <div className="premium-stat-value mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight text-slate-900">{value}</span>
        {unit ? <span className="text-sm text-slate-500">{unit}</span> : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
      <div className="premium-pulse-bar premium-pulse-bar--paused mt-3 opacity-40" />
    </div>
  )
}
