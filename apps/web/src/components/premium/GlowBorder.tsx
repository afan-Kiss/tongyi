import React from 'react'

type Tone = 'ok' | 'warn' | 'error' | 'info'

const toneClass: Record<Tone, string> = {
  ok: 'premium-glow-border--ok',
  warn: 'premium-glow-border--warn',
  error: 'premium-glow-border--error',
  info: 'premium-glow-border--info',
}

export const GlowBorder: React.FC<{
  tone?: Tone
  className?: string
  innerClassName?: string
  children: React.ReactNode
}> = ({ tone = 'info', className = '', innerClassName = '', children }) => (
  <div className={`premium-glow-border ${toneClass[tone]} ${className}`}>
    <div className={`premium-glow-border__inner ${innerClassName}`}>{children}</div>
  </div>
)
