import React, { useCallback, useEffect, useState } from 'react'
import { platformApi } from '@/api/endpoints'
import { GlowBorder, PremiumButton, PremiumCard } from '@/components/premium'

export const LiveAnalysisSettingsPage: React.FC = () => {
  const [legacyUrl, setLegacyUrl] = useState('')
  const [online, setOnline] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await platformApi.portalOverview()
      setLegacyUrl(r.data.liveAnalysis?.url || '')
      setOnline(Boolean(r.data.liveAnalysis?.online))
    } catch {
      setLegacyUrl('')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openLegacy = () => {
    if (!legacyUrl) {
      setMsg('未配置 LIVE_ANALYSIS_WEB_URL，旧主播分析备份入口不可用')
      return
    }
    window.open(legacyUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-4">
      <GlowBorder>
        <PremiumCard title="迁移说明">
          <p className="text-sm text-slate-600">
            tongyi 已启用原生主播分析模块。旧系统（live-business-web）仅作迁移期备份，主入口是本页面。
            小红书 API 自动同步、完整 BI 钻取将在后续批次从旧系统迁入。
          </p>
        </PremiumCard>
      </GlowBorder>

      <GlowBorder>
        <PremiumCard title="旧主播分析系统（备份）">
          <p className="mb-3 text-sm text-slate-600">
            状态：{legacyUrl ? (online ? '在线' : '离线') : '未配置'}
            {legacyUrl ? ` · ${legacyUrl}` : ''}
          </p>
          <PremiumButton variant="secondary" onClick={openLegacy}>
            打开旧主播分析系统（备份）
          </PremiumButton>
          {msg ? <p className="mt-2 text-sm text-amber-700">{msg}</p> : null}
        </PremiumCard>
      </GlowBorder>
    </div>
  )
}
