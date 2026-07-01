import React from 'react'
import { PremiumCard } from '@/components/premium'
import { reviewCenterApi } from '@/api/endpoints'

type ReviewRow = Record<string, unknown>

export function ReviewCard({
  row,
  onHandled,
  onIgnored,
}: {
  row: ReviewRow
  onHandled?: (id: string) => void
  onIgnored?: (id: string) => void
}) {
  const id = String(row.id)
  const negative = Number(row.score ?? 5) <= 3
  return (
    <PremiumCard className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-slate-800">{String(row.buyerName || '买家')}</div>
        <div className={negative ? 'text-sm font-semibold text-red-600' : 'text-sm text-amber-600'}>
          {row.score != null ? `${row.score} 分` : '—'}
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-600">{String(row.content || '（无文字评价）')}</p>
      {row.hint ? <p className="mt-2 text-xs text-slate-500">{String(row.hint)}</p> : null}
      <p className="mt-2 text-xs text-slate-400">
        店铺 {String(row.shopName || '—')} · 订单 {String(row.orderNo || '—')} · 回复 {String(row.replyStatus || '—')}
      </p>
      {row.handleStatus === 'pending' && onHandled && onIgnored ? (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onHandled(id)} className="rounded-full bg-[#ff2442] px-3 py-1 text-xs text-white">
            标记已处理
          </button>
          <button type="button" onClick={() => onIgnored(id)} className="rounded-full bg-white/80 px-3 py-1 text-xs text-slate-600">
            忽略
          </button>
        </div>
      ) : null}
    </PremiumCard>
  )
}

export async function markReviewHandled(id: string) {
  await reviewCenterApi.markHandled(id)
}

export async function markReviewIgnored(id: string) {
  await reviewCenterApi.markIgnored(id)
}
