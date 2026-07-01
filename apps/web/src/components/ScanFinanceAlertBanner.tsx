import React from 'react'
import { GlowBorder, PremiumButton, PremiumCard } from '@/components/premium'

export interface FinanceAlertView {
  id: string
  type: 'cashback' | 'expense' | 'refund' | 'note'
  typeLabel: string
  amount?: number | null
  title?: string | null
  message?: string | null
  plainSummary: string
  status: string
}

interface Props {
  alerts: FinanceAlertView[]
  warning?: string
  onHandled?: (id: string) => void
  compact?: boolean
}

export const ScanFinanceAlertBanner: React.FC<Props> = ({ alerts, warning, onHandled, compact }) => {
  if (warning && !alerts.length) {
    return <p className="text-xs text-amber-700">{warning}</p>
  }
  if (!alerts.length) return null

  const tone = alerts.some((a) => a.type === 'refund') ? 'error' : 'warn'

  return (
    <div className={`space-y-2 ${compact ? '' : 'mb-3'}`}>
      {warning ? <p className="text-xs text-amber-700">{warning}</p> : null}
      {alerts.map((alert) => (
        <GlowBorder key={alert.id} tone={tone}>
          <PremiumCard hover={false} className="border-0 bg-transparent shadow-none">
            <p className="text-sm font-medium text-slate-800">{alert.typeLabel}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{alert.plainSummary}</p>
            {onHandled ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <PremiumButton variant="primary" className="px-3 py-1 text-xs" onClick={() => onHandled(alert.id)}>
                  已处理
                </PremiumButton>
                <PremiumButton variant="ghost" className="px-3 py-1 text-xs" disabled>
                  稍后处理
                </PremiumButton>
              </div>
            ) : null}
          </PremiumCard>
        </GlowBorder>
      ))}
    </div>
  )
}
