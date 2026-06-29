import React, { useState } from 'react'

import { ExternalLink } from 'lucide-react'

import type { OperationLog } from '@/api/types'
import { formatDateTime } from '@/lib/formatDateTime'
import { displayOperationDetail, displayOperationLabel } from '@/lib/operationLogLabel'
import { openXhsArkDetail } from '@/lib/xhsOrdersApi'

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

function canOpenArk(log: OperationLog): boolean {
  const orderNo = (log.orderNo || '').trim()
  if (orderNo) return true
  return log.opType === 'inbound' || log.opType === 'outbound'
}

type Props = {
  logs: OperationLog[]
  emptyText?: string
  onOpen: (certNo: string) => void
  /** 卡片右侧显示千帆售后跳转（需操作记录含订单号） */
  showArkLink?: boolean
  onArkError?: (message: string) => void
}

export const OperationLogList: React.FC<Props> = ({
  logs,
  emptyText = '暂无记录',
  onOpen,
  showArkLink = false,
  onArkError,
}) => {
  const [arkOpeningId, setArkOpeningId] = useState('')

  if (!logs.length) {
    return <p className="text-sm text-slate-400">{emptyText}</p>
  }

  const openArk = async (log: OperationLog) => {
    const orderNo = (log.orderNo || '').trim()
    setArkOpeningId(log.id)
    try {
      if (!orderNo) {
        throw new Error(`${log.certNo} 暂无关联订单号，请先在出库时填写或在 Excel 订单号列维护`)
      }
      await openXhsArkDetail({ orderNo, openTarget: 'order' })
    } catch (e) {
      onArkError?.(e instanceof Error ? e.message : String(e))
    } finally {
      setArkOpeningId('')
    }
  }

  return (
    <div className="space-y-2">
      {logs.map((log, i) => {
        const meta = metaLine(log)
        const showArk = showArkLink && canOpenArk(log)
        return (
          <div
            key={log.id}
            className="board-stagger-item flex gap-2 rounded-xl border border-rose-50 bg-rose-50/30 px-3 py-2.5 transition hover:bg-rose-50"
            style={{ '--i': i } as React.CSSProperties}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => onOpen(log.certNo)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-900">{log.certNo}</span>
                  {meta && <p className="mt-0.5 text-[11px] text-slate-400">{meta}</p>}
                  {log.orderNo && (
                    <p className="mt-0.5 text-[10px] text-violet-700">订单 {log.orderNo}</p>
                  )}
                </div>
                {!showArk && (
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass(log.opType)}`}
                    >
                      {displayOperationLabel(log)}
                    </span>
                    <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(log.createdAt)}</p>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{displayOperationDetail(log)}</p>
            </button>

            {showArk && (
              <div className="flex shrink-0 flex-col items-end justify-between gap-1.5">
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass(log.opType)}`}
                  >
                    {displayOperationLabel(log)}
                  </span>
                  <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(log.createdAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={!!arkOpeningId}
                  onClick={() => void openArk(log)}
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"
                  title="在千帆打开订单详情（可从订单页进入售后）"
                >
                  <ExternalLink size={12} />
                  {arkOpeningId === log.id ? '跳转…' : '千帆订单'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
