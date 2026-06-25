import React from 'react'

import type { OperationLog } from '@/api/types'
import { formatDateTime } from '@/lib/formatDateTime'
import { displayOperationDetail, displayOperationLabel } from '@/lib/operationLogLabel'

function badgeClass(opType: string): string {
  switch (opType) {
    case 'outbound':
      return 'bg-amber-100 text-amber-800'
    case 'inbound':
      return 'bg-emerald-100 text-emerald-800'
    case 'register':
    case 'new_inbound':
    case 'update':
      return 'bg-sky-100 text-sky-800'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function metaLine(log: OperationLog): string {
  const parts: string[] = []
  if (log.bracelet?.category) parts.push(log.bracelet.category)
  if (log.bracelet?.ringSize) parts.push(`圈口 ${log.bracelet.ringSize}`)
  if (log.bracelet?.batch) parts.push(`批次 ${log.bracelet.batch}`)
  return parts.join(' · ')
}

type Props = {
  logs: OperationLog[]
  emptyText?: string
  onOpen: (certNo: string) => void
}

export const OperationLogList: React.FC<Props> = ({ logs, emptyText = '暂无记录', onOpen }) => {
  if (!logs.length) {
    return <p className="text-sm text-slate-400">{emptyText}</p>
  }

  return (
    <div className="space-y-2">
      {logs.map((log, i) => {
        const meta = metaLine(log)
        return (
          <button
            key={log.id}
            type="button"
            className="board-stagger-item flex w-full flex-col gap-1 rounded-xl border border-rose-50 bg-rose-50/30 px-3 py-2.5 text-left transition hover:bg-rose-50"
            style={{ '--i': i } as React.CSSProperties}
            onClick={() => onOpen(log.certNo)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-semibold text-slate-900">{log.certNo}</span>
                {meta && <p className="mt-0.5 text-[11px] text-slate-400">{meta}</p>}
              </div>
              <div className="shrink-0 text-right">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass(log.opType)}`}>
                  {displayOperationLabel(log)}
                </span>
                <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(log.createdAt)}</p>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{displayOperationDetail(log)}</p>
          </button>
        )
      })}
    </div>
  )
}
