import React from 'react'
import { PremiumCard } from '@/components/premium'
import { afterSaleWorkbenchApi } from '@/api/endpoints'

type AfterSaleRow = Record<string, unknown>

export function AfterSaleCard({
  row,
  onHandled,
  onIgnored,
  onShowRaw,
}: {
  row: AfterSaleRow
  onHandled?: (id: string) => void
  onIgnored?: (id: string) => void
  onShowRaw?: (row: AfterSaleRow) => void
}) {
  const id = String(row.id)
  return (
    <PremiumCard className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-slate-800">售后单 {String(row.afterSaleNo || '—')}</div>
        <div className="text-sm text-slate-500">{String(row.status || '—')}</div>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        订单 {String(row.orderNo || '—')} · 退款 ¥{Number(row.refundAmount || 0).toFixed(2)}
      </p>
      {row.reason ? <p className="mt-1 text-sm text-slate-500">原因：{String(row.reason)}</p> : null}
      {row.hint ? <p className="mt-2 text-xs text-slate-500">{String(row.hint)}</p> : null}
      {row.financePending ? (
        <p className="mt-1 text-xs text-amber-600">财务提醒待确认</p>
      ) : row.financeHandled ? (
        <p className="mt-1 text-xs text-emerald-600">财务已处理</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {onShowRaw ? (
          <button type="button" onClick={() => onShowRaw(row)} className="rounded-full bg-white/80 px-3 py-1 text-xs">
            查看原始数据
          </button>
        ) : null}
        {row.handleStatus === 'pending' && onHandled && onIgnored ? (
          <>
            <button type="button" onClick={() => onHandled(id)} className="rounded-full bg-[#ff2442] px-3 py-1 text-xs text-white">
              标记已处理
            </button>
            <button type="button" onClick={() => onIgnored(id)} className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-600">
              忽略
            </button>
          </>
        ) : null}
      </div>
    </PremiumCard>
  )
}

export async function markAfterSaleHandled(id: string) {
  await afterSaleWorkbenchApi.markHandled(id)
}

export async function markAfterSaleIgnored(id: string) {
  await afterSaleWorkbenchApi.markIgnored(id)
}
