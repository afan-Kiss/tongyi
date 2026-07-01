import React from 'react'
import { ShieldOff } from 'lucide-react'
import { LICENSE_DISABLED_MESSAGE } from '@/lib/license'

export const LicenseBlocked: React.FC<{ message?: string }> = ({ message }) => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-warm)] px-4 py-8">
    <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white/95 p-6 text-center shadow-lg">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
        <ShieldOff className="h-6 w-6" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900">统一经营台暂不可用</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {message || LICENSE_DISABLED_MESSAGE}
      </p>
    </div>
  </div>
)
