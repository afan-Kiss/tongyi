import React, { useCallback, useEffect, useState } from 'react'
import { platformApi } from '@/api/endpoints'
import { PremiumPage, SystemFrame } from '@/components/premium'

export const LiveAnalysisPortalPage: React.FC = () => {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof platformApi.portalOverview>>['data']['liveAnalysis'] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await platformApi.portalOverview()
      setInfo(r.data.liveAnalysis)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <PremiumPage title="主播分析" subtitle="第一阶段统一入口，数据暂不合并。连接失败不影响扫码。">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <SystemFrame
        title="主播分析"
        description="通过代理嵌入现有主播分析系统"
        proxyPath={info?.proxyPath || '/zhubo-proxy'}
        externalUrl={info?.url}
        online={info?.online}
        statusMessage={info?.online ? '连接正常' : info?.url ? '暂时连不上' : '未配置'}
        plainMessage={info?.plainMessage}
      />
    </PremiumPage>
  )
}
