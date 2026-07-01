import React from 'react'
import type { StatusTone } from './StatusPulse'
import { StatusPulse } from './StatusPulse'
import { EmptyState } from './EmptyState'

export interface TimelineItem {
  id: string
  title: string
  subtitle?: string
  time?: string
  tone?: StatusTone
}

export const TimelinePanel: React.FC<{
  title: string
  items: TimelineItem[]
  emptyTitle?: string
  emptyDescription?: string
  maxHeightClass?: string
}> = ({ title, items, emptyTitle = '暂无记录', emptyDescription, maxHeightClass = 'max-h-72' }) => (
  <div>
    {title ? <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3> : null}
    {!items.length ? (
      <EmptyState title={emptyTitle} description={emptyDescription} compact />
    ) : (
      <ul className={`space-y-0 overflow-auto ${maxHeightClass}`}>
        {items.map((item, idx) => (
          <li key={item.id} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
            {idx < items.length - 1 ? (
              <span className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-slate-200" />
            ) : null}
            <StatusPulse tone={item.tone || 'idle'} className="relative z-[1] mt-1" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-800">{item.title}</div>
              {item.subtitle ? <div className="mt-0.5 text-sm text-slate-600">{item.subtitle}</div> : null}
              {item.time ? <div className="mt-1 text-[11px] text-slate-400">{item.time}</div> : null}
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
)
