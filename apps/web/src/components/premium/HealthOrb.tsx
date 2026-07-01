import React from 'react'

type Tone = 'ok' | 'warn' | 'error' | 'idle'

const toneMap: Record<Tone, { ring: string; core: string; text: string }> = {
  ok: { ring: 'from-emerald-300/60 to-teal-300/40', core: 'from-emerald-400 to-teal-400', text: 'text-emerald-700' },
  warn: { ring: 'from-amber-300/60 to-orange-300/40', core: 'from-amber-400 to-orange-400', text: 'text-amber-700' },
  error: { ring: 'from-red-300/60 to-rose-300/40', core: 'from-red-400 to-rose-500', text: 'text-red-700' },
  idle: { ring: 'from-slate-200/80 to-slate-300/50', core: 'from-slate-300 to-slate-400', text: 'text-slate-600' },
}

export const HealthOrb: React.FC<{
  value?: string | number
  label?: string
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
}> = ({ value, label, tone = 'idle', size = 'md' }) => {
  const px = size === 'sm' ? 56 : size === 'lg' ? 96 : 72
  const t = toneMap[tone]
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: px, height: px }}>
        <div className={`premium-orb-ring absolute inset-0 rounded-full bg-gradient-to-tr ${t.ring} p-[3px]`}>
          <div className="h-full w-full rounded-full bg-white/90" />
        </div>
        <div className={`absolute inset-[10px] flex items-center justify-center rounded-full bg-gradient-to-br ${t.core} text-white shadow-inner`}>
          <span className={`font-semibold ${size === 'lg' ? 'text-lg' : 'text-sm'}`}>{value ?? '—'}</span>
        </div>
      </div>
      {label ? <span className={`text-xs font-medium ${t.text}`}>{label}</span> : null}
    </div>
  )
}
