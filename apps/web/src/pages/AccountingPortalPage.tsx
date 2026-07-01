import React, { useCallback, useEffect, useState } from 'react'
import { platformApi } from '@/api/endpoints'

export const AccountingPortalPage: React.FC = () => {
  const [info, setInfo] = useState<{ url: string; online: boolean; message: string; plainMessage: string } | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await platformApi.portalOverview()
      setInfo(r.data.accounting)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const iframeSrc = info?.url ? '/jizhang-proxy/' : ''

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">经营记账</h2>
        <p className="text-sm text-slate-500">第一阶段统一入口，数据库暂不合并</p>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {info && (
        <div className={`rounded-2xl border p-3 text-sm ${info.online ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {info.plainMessage}
          {!info.url && <div className="mt-1 text-xs">请在服务器 .env 配置 JIZHANG_WEB_URL</div>}
        </div>
      )}

      {iframeSrc ? (
        <div className="overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm">
          <iframe title="经营记账" src={iframeSrc} className="h-[70vh] w-full border-0" />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          记账系统地址未配置，扫码/库存功能不受影响。
        </div>
      )}
    </div>
  )
}
