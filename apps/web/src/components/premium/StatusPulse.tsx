import React from 'react'
import type { LucideIcon } from 'lucide-react'

type Tone = 'online' | 'warning' | 'error' | 'idle'

const toneClass: Record<Tone, string> = {
  online: 'bg-emerald-500 premium-pulse-online',
  warning: 'bg-amber-500 premium-pulse-warning',
  error: 'bg-red-500 premium-pulse-error',
  idle: 'bg-slate-300',
}

export const StatusPulse: React.FC<{ tone?: Tone; className?: string }> = ({ tone = 'idle', className = '' }) => (
  <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${toneClass[tone]} ${className}`} />
)

export const BreathingDot: React.FC<{ tone?: Tone; label?: string }> = ({ tone = 'idle', label }) => (
  <span className="inline-flex items-center gap-1.5">
    <StatusPulse tone={tone} />
    {label ? <span className="text-xs text-slate-500">{label}</span> : null}
  </span>
)

export type { Tone as StatusTone }
