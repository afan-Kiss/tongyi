import React, { useCallback, useEffect, useState } from 'react'
import { platformApi } from '@/api/endpoints'
import { GlowBorder, PremiumButton, PremiumCard } from '@/components/premium'

export const AccountingSettingsPage: React.FC = () => {
  const [legacyUrl, setLegacyUrl] = useState('')
  const [online, setOnline] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await platformApi.portalOverview()
      setLegacyUrl(r.data.accounting?.url || '')
      setOnline(Boolean(r.data.accounting?.online))
    } catch {
      setLegacyUrl('')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openLegacy = () => {
    if (!legacyUrl) {
      setMsg('未配置 JIZHANG_WEB_URL，旧记账系统备份入口不可用')
      return
    }
    window.open(legacyUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-4">
      <GlowBorder>
        <PremiumCard title="数据迁移说明">
          <p className="text-sm text-slate-600">
            tongyi 已启用原生记账模块。旧记账系统（Vue 独立部署）仅作迁移期只读备份，不再是主入口。
            历史 Expense 数据将在后续批次从 <code className="text-xs">accounting.db</code> 导入到 tongyi 统一库。
          </p>
        </PremiumCard>
      </GlowBorder>

      <GlowBorder>
        <PremiumCard title="旧系统备份入口">
          <p className="mb-3 text-sm text-slate-600">
            状态：{legacyUrl ? (online ? '在线' : '离线') : '未配置'}
            {legacyUrl ? ` · ${legacyUrl}` : ''}
          </p>
          <PremiumButton variant="secondary" onClick={openLegacy}>
            打开旧记账系统（备份）
          </PremiumButton>
          {msg ? <p className="mt-2 text-sm text-amber-700">{msg}</p> : null}
        </PremiumCard>
      </GlowBorder>
    </div>
  )
}
