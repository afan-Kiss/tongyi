import React, { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { PremiumCard } from './PremiumCard'
import { PremiumButton } from './PremiumButton'
import { LoadingRing } from './LoadingRing'
import { BreathingDot } from './StatusPulse'
import type { StatusTone } from './StatusPulse'
import { EmptyState } from './EmptyState'

export const SystemFrame: React.FC<{
  title: string
  description?: string
  proxyPath: string
  externalUrl?: string
  online?: boolean
  statusMessage?: string
  plainMessage?: string
}> = ({ title, description, proxyPath, externalUrl, online, statusMessage, plainMessage }) => {
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const src = externalUrl ? `${proxyPath}/` : ''

  useEffect(() => {
    if (!src) return
    setLoading(true)
  }, [src, refreshKey])

  const tone: StatusTone = !externalUrl ? 'idle' : online ? 'online' : 'warning'

  return (
    <PremiumCard
      title={title}
      subtitle={description}
      tone={online ? 'ok' : externalUrl ? 'warn' : 'info'}
      headerRight={<BreathingDot tone={tone} label={statusMessage || (online ? '连接正常' : externalUrl ? '暂时连不上' : '未配置')} />}
    >
      {plainMessage ? (
        <div className={`mb-3 rounded-xl px-3 py-2 text-sm ${online ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          {plainMessage}
        </div>
      ) : null}

      {!externalUrl ? (
        <EmptyState
          title="地址还没配置"
          description="在服务器 .env 或系统发现里配置地址。扫码和库存功能不受影响。"
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <PremiumButton variant="secondary" onClick={() => setRefreshKey((k) => k + 1)}>
              <RefreshCw size={14} /> 刷新
            </PremiumButton>
            <PremiumButton variant="ghost" onClick={() => window.open(externalUrl, '_blank', 'noopener,noreferrer')}>
              <ExternalLink size={14} /> 新窗口打开
            </PremiumButton>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/80 bg-white shadow-inner">
            {loading ? (
              <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white/80">
                <LoadingRing size="lg" label="正在加载页面…" />
              </div>
            ) : null}
            <iframe
              key={refreshKey}
              title={title}
              src={src}
              className="h-[70vh] w-full border-0"
              onLoad={() => setLoading(false)}
            />
          </div>
        </>
      )}
    </PremiumCard>
  )
}
