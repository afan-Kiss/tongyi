import React, { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { GlowBorder, PremiumCard, SkeletonCard } from '@/components/premium'
import type { LiveSessionView } from '@/api/types'
import { liveAnalysisApi } from './liveAnalysisShared'

export const LiveSessionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<LiveSessionView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const r = await liveAnalysisApi.session(id)
      setSession(r.data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <SkeletonCard />
  if (error || !session) return <p className="text-sm text-red-600">{error || '场次不存在'}</p>

  return (
    <div className="space-y-4">
      <Link to="/inventory/live-analysis/sessions" className="text-sm text-[#ff2442] hover:underline">
        ← 返回场次列表
      </Link>
      <GlowBorder>
        <PremiumCard title={session.title || session.sessionNo} subtitle={session.plainSummary}>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>主播：{session.anchorDisplayName}</p>
            <p>开播：{new Date(session.startedAt).toLocaleString('zh-CN')}</p>
            <p>支付金额：¥{session.grossSalesAmount.toFixed(2)}</p>
            <p>有效成交：¥{session.validSalesAmount.toFixed(2)}</p>
            <p>退款：¥{session.refundAmount.toFixed(2)}（{session.refundCount} 单）</p>
            <p>订单数：{session.orderCount}</p>
          </div>
        </PremiumCard>
      </GlowBorder>
      {session.orders?.length ? (
        <PremiumCard title="订单明细">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2 pr-3">订单号</th>
                  <th className="py-2 pr-3">商品</th>
                  <th className="py-2 pr-3">支付</th>
                  <th className="py-2 pr-3">有效</th>
                  <th className="py-2">售后</th>
                </tr>
              </thead>
              <tbody>
                {session.orders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{o.orderNo}</td>
                    <td className="py-2 pr-3">{o.productName || '—'}</td>
                    <td className="py-2 pr-3">¥{o.amount.toFixed(2)}</td>
                    <td className="py-2 pr-3">¥{o.validAmount.toFixed(2)}</td>
                    <td className="py-2 text-xs">{o.afterSaleStatus || '无'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      ) : (
        <p className="text-sm text-slate-500">本场次暂无订单明细，导入 CSV 时可带上订单行。</p>
      )}
    </div>
  )
}
