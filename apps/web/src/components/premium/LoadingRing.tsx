import React from 'react'

type Size = 'sm' | 'md' | 'lg'

const sizeClass: Record<Size, string> = {
  sm: 'premium-loading-ring--sm',
  md: 'premium-loading-ring--md',
  lg: 'premium-loading-ring--lg',
}

export const LoadingRing: React.FC<{ size?: Size; label?: string; className?: string }> = ({
  size = 'md',
  label,
  className = '',
}) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <span className={`premium-loading-ring ${sizeClass[size]}`} aria-hidden />
    {label ? <span className="text-sm text-slate-500">{label}</span> : null}
  </span>
)
