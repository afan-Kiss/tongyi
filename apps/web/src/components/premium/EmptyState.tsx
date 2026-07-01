import React from 'react'
import { Inbox } from 'lucide-react'

export const EmptyState: React.FC<{
  title: string
  description?: string
  compact?: boolean
  action?: React.ReactNode
}> = ({ title, description, compact, action }) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6' : 'py-10'}`}>
    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-50 via-white to-sky-50 text-[#ff2442]/70 shadow-sm">
      <Inbox size={24} />
    </div>
    <p className="text-sm font-medium text-slate-700">{title}</p>
    {description ? <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p> : null}
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
)
