import React from 'react'

interface Props {
  title: string
  value: React.ReactNode
  hint?: string
  accent?: string
  onClick?: () => void
}

export const StatCard: React.FC<Props> = ({ title, value, hint, accent = 'from-rose-500 to-pink-400', onClick }) => (
  <div
    className={`relative overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm ${onClick ? 'card-clickable' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
  >
    <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${accent}`} />
    <p className="text-xs text-slate-500">{title}</p>
    <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
  </div>
)
