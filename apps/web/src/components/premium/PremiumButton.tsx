import React from 'react'
import { LoadingRing } from './LoadingRing'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'

const variantClass: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-[#ff2442] to-[#ff6b81] text-white shadow-sm hover:shadow-md',
  secondary: 'border border-slate-200 bg-white/90 text-slate-700 hover:bg-white',
  ghost: 'text-slate-600 hover:bg-white/80',
  danger: 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  success: 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
}

export const PremiumButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }
> = ({ variant = 'secondary', loading, children, className = '', disabled, ...rest }) => (
  <button
    type="button"
    {...rest}
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${variantClass[variant]} ${className}`}
  >
    {loading ? <LoadingRing size="sm" /> : null}
    {children}
  </button>
)
