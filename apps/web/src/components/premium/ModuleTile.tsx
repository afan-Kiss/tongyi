import React from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { BreathingDot } from './StatusPulse'
import type { StatusTone } from './StatusPulse'

export const ModuleTile: React.FC<{
  title: string
  description: string
  to?: string
  statusLabel: string
  statusTone?: StatusTone
  updatedAt?: string
  icon: LucideIcon
  onClick?: () => void
}> = ({ title, description, to, statusLabel, statusTone = 'idle', updatedAt, icon: Icon, onClick }) => {
  const body = (
    <div className="premium-glass premium-glass-hover h-full rounded-2xl p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-white text-[#ff2442]">
          <Icon size={18} />
        </div>
        <BreathingDot tone={statusTone} label={statusLabel} />
      </div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
      {updatedAt ? <p className="mt-2 text-[11px] text-slate-400">更新 {updatedAt}</p> : null}
      {to ? (
        <div className="mt-3 text-sm font-medium text-[#ff2442]">进入模块 →</div>
      ) : null}
    </div>
  )
  if (to) return <Link to={to} className="block h-full">{body}</Link>
  return (
    <button type="button" className="block h-full w-full text-left" onClick={onClick}>
      {body}
    </button>
  )
}
