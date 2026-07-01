import React, { useCallback, useEffect, useState } from 'react'
import { PremiumCard } from '@/components/premium'
import { qianfanSyncApi } from '@/api/endpoints'

export const QianfanSyncSettingsPage: React.FC = () => {
  const [shops, setShops] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await qianfanSyncApi.shops()
      setShops(r.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <PremiumCard className="p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Cookie 来源</p>
        <p className="mt-2">
          店铺 Cookie 从「辅助出库软件」的 <code className="rounded bg-slate-100 px-1">config.json</code> 自动读取（
          <code className="rounded bg-slate-100 px-1">xhs_accounts</code>）。也可通过千帆中转机器人 CDP 采集后写入该文件。
        </p>
        <p className="mt-2">环境变量 <code className="rounded bg-slate-100 px-1">OUTBOUND_CONFIG_PATH</code> 可指定自定义路径。</p>
      </PremiumCard>

      <PremiumCard className="p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">同步说明</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>订单、售后接口沿用祥钰已验证的 Ark API</li>
          <li>评价/评分使用 POST + source 参数（与千帆后台一致）</li>
          <li>单项失败不会拖垮整店同步，详见同步日志</li>
          <li>Raw 表保留完整 JSON，业务表（主播分析/财务提醒）自动增量更新</li>
        </ul>
      </PremiumCard>

      {loading ? (
        <p className="text-sm text-slate-500">加载店铺…</p>
      ) : (
        <div className="space-y-2">
          {shops.map((shop) => (
            <PremiumCard key={String(shop.id)} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{String(shop.shopName)}</div>
                <div className="text-xs text-slate-500">{String(shop.cookieHint || '')}</div>
              </div>
              <span className="text-xs text-slate-400">{String(shop.status || 'active')}</span>
            </PremiumCard>
          ))}
          {!shops.length ? <PremiumCard className="p-4 text-sm text-slate-500">未检测到店铺，请配置 Cookie 后刷新。</PremiumCard> : null}
        </div>
      )}
    </div>
  )
}
