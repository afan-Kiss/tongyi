import React, { useCallback, useEffect, useState } from 'react'
import { accountingApi } from '@/api/endpoints'
import { EmptyState, PremiumButton, PremiumCard, SkeletonTable } from '@/components/premium'
import type { AccountingRecordView } from '@/api/types'

export const AccountingTransactionsPage: React.FC = () => {
  const [items, setItems] = useState<AccountingRecordView[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<'all' | 'pending' | 'handled' | 'ignored'>('all')
  const [recordType, setRecordType] = useState<'all' | 'expense' | 'cashback' | 'refund' | 'income'>('all')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await accountingApi.list({ status, recordType, page: 1, pageSize: 50 })
      setItems(r.data.items)
      setTotal(r.data.total)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [status, recordType])

  useEffect(() => {
    void load()
  }, [load])

  const markHandled = async (id: string) => {
    try {
      await accountingApi.markHandled(id)
      setMsg('已标记为已处理')
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={recordType}
          onChange={(e) => setRecordType(e.target.value as typeof recordType)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
        >
          <option value="all">全部类型</option>
          <option value="expense">支出</option>
          <option value="cashback">返现</option>
          <option value="refund">退款</option>
          <option value="income">收入</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
        >
          <option value="all">全部状态</option>
          <option value="pending">待处理</option>
          <option value="handled">已处理</option>
          <option value="ignored">已忽略</option>
        </select>
        <PremiumButton variant="secondary" onClick={() => void load()}>
          刷新
        </PremiumButton>
      </div>

      {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : items.length === 0 ? (
        <EmptyState title="暂无记账记录" description="可以先新增支出或返现" />
      ) : (
        <PremiumCard title={`流水（共 ${total} 条）`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">单号</th>
                  <th className="py-2 pr-3">类型</th>
                  <th className="py-2 pr-3">金额</th>
                  <th className="py-2 pr-3">订单/物流</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{row.recordNo}</td>
                    <td className="py-2 pr-3">{row.recordTypeLabel}</td>
                    <td className="py-2 pr-3">¥{row.amount.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-xs">
                      {row.externalOrderNo || '—'}
                      {row.logisticsNo ? ` / ${row.logisticsNo}` : ''}
                    </td>
                    <td className="py-2 pr-3">{row.statusLabel}</td>
                    <td className="py-2">
                      {row.customerPaymentStatus === 'pending' ? (
                        <button
                          type="button"
                          className="text-xs text-[#ff2442] hover:underline"
                          onClick={() => void markHandled(row.id)}
                        >
                          已处理
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      )}
    </div>
  )
}
