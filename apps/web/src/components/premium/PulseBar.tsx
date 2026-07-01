import React from 'react'

type Mode = 'active' | 'paused' | 'error'

const modeClass: Record<Mode, string> = {
  active: 'premium-pulse-bar premium-pulse-bar--active',
  paused: 'premium-pulse-bar premium-pulse-bar--paused',
  error: 'premium-pulse-bar premium-pulse-bar--error',
}

export const PulseBar: React.FC<{ mode?: Mode; label?: string; className?: string }> = ({
  mode = 'active',
  label,
  className = '',
}) => (
  <div className={className}>
    {label ? <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500"><span>{label}</span></div> : null}
    <div className={modeClass[mode]} />
  </div>
)
