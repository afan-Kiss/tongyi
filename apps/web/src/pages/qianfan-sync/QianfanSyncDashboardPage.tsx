import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PremiumCard, PremiumStatCard, SkeletonCard } from '@/components/premium'
import { qianfanSyncApi } from '@/api/endpoints'
import { Database, RefreshCw } from 'lucide-react'

export const QianfanSyncDashboardPage: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof qianfanSyncApi.overview>>['data'] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await qianfanSyncApi.overview()
      setOverview(r.data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runSync = async (fn: () => Promise<unknown>, label: string) => {
    setSyncing(true)
    setMessage(`正在${label}…`)
    try {
      await fn()
      setMessage(`${label}已提交，请查看同步日志`)
      await load()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `${label}失败`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : overview ? (
        <>
          <p className="text-sm text-slate-500">{overview.hint}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PremiumStatCard title="店铺数" value={String(overview.stats.shopCount)} icon={Database} />
            <PremiumStatCard title="今日同步订单" value={String(overview.stats.ordersToday)} />
            <PremiumStatCard title="今日同步售后" value={String(overview.stats.afterSalesToday)} />
            <PremiumStatCard title="今日同步评价" value={String(overview.stats.reviewsToday)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={syncing}
              onClick={() => void runSync(() => qianfanSyncApi.runAll('all'), '同步全部')}
              className="inline-flex items-center gap-1 rounded-full bg-[#ff2442] px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              立即同步全部
            </button>
            <button type="button" disabled={syncing} onClick={() => void runSync(() => qianfanSyncApi.runOrders(), '同步订单')} className="rounded-full bg-white/80 px-4 py-2 text-sm">
              同步订单
            </button>
            <button type="button" disabled={syncing} onClick={() => void runSync(() => qianfanSyncApi.runAfterSales(), '同步售后')} className="rounded-full bg-white/80 px-4 py-2 text-sm">
              同步售后
            </button>
            <button type="button" disabled={syncing} onClick={() => void runSync(() => qianfanSyncApi.runReviews(), '同步评价')} className="rounded-full bg-white/80 px-4 py-2 text-sm">
              同步评价
            </button>
            <button type="button" disabled={syncing} onClick={() => void runSync(() => qianfanSyncApi.runLive(), '同步直播')} className="rounded-full bg-white/80 px-4 py-2 text-sm">
              同步直播
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {overview.shops.map((shop) => (
              <PremiumCard key={shop.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-800">{shop.shopName}</h3>
                    <p className="mt-1 text-xs text-slate-500">{shop.cookieHint}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      最近同步：{shop.lastSyncAt ? new Date(shop.lastSyncAt).toLocaleString() : '尚未同步'}
                    </p>
                  </div>
                  <span
                    className={[
                      'rounded-full px-2 py-0.5 text-xs',
                      shop.cookieStatus === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                    ].join(' ')}
                  >
                    {shop.cookieStatus === 'ok' ? 'Cookie 正常' : 'Cookie 异常'}
                  </span>
                </div>
              </PremiumCard>
            ))}
            {!overview.shops.length ? (
              <PremiumCard className="p-6 text-sm text-slate-500">
                暂无店铺配置。请在「设置」中确认辅助出库软件的 Cookie，或先采集千帆 Cookie。
              </PremiumCard>
            ) : null}
          </div>
          <Link to="/inventory/qianfan-sync/logs" className="text-sm text-[#ff2442] hover:underline">
            查看同步日志 →
          </Link>
        </>
      ) : null}
    </div>
  )
}
