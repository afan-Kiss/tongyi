import React from 'react'
import { SkeletonBlock } from './SkeletonBlock'

type Tone = 'default' | 'ok' | 'warn' | 'danger' | 'info'

const toneTopline: Record<Tone, string> = {
  default: 'linear-gradient(90deg, #ff2442, #ff6b81)',
  ok: 'linear-gradient(90deg, #10b981, #14b8a6)',
  warn: 'linear-gradient(90deg, #f59e0b, #fb923c)',
  danger: 'linear-gradient(90deg, #ef4444, #ff2442)',
  info: 'linear-gradient(90deg, #0ea5e9, #8b5cf6)',
}

export const PremiumCard: React.FC<{
  title?: string
  subtitle?: string
  tone?: Tone
  hover?: boolean
  className?: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}> = ({ title, subtitle, tone = 'default', hover = true, className = '', headerRight, children }) => (
  <section
    className={`premium-topline premium-glass rounded-2xl p-4 shadow-sm ${hover ? 'premium-glass-hover' : ''} ${className}`}
    style={{ ['--premium-topline-gradient' as string]: toneTopline[tone] }}
  >
    {(title || headerRight) && (
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          {title ? <h3 className="text-sm font-semibold text-slate-800">{title}</h3> : null}
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {headerRight}
      </div>
    )}
    {children}
  </section>
)

export const PremiumCardSkeleton: React.FC = () => (
  <div className="premium-glass rounded-2xl p-4">
    <SkeletonBlock className="mb-3 h-4 w-32" />
    <SkeletonBlock className="h-20 w-full" />
  </div>
)
