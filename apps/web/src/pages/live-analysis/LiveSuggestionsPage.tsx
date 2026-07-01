import React, { useCallback, useEffect, useState } from 'react'
import { GlowBorder, PremiumButton, PremiumCard, TimelinePanel, type TimelineItem } from '@/components/premium'
import type { LiveSuggestionView } from '@/api/types'
import { PeriodPicker, useLivePeriod, liveAnalysisApi } from './liveAnalysisShared'

const PRIORITY_TONE: Record<string, 'online' | 'warning' | 'idle'> = {
  high: 'warning',
  medium: 'idle',
  low: 'idle',
}

export const LiveSuggestionsPage: React.FC = () => {
  const { period, setPeriod } = useLivePeriod('month')
  const [items, setItems] = useState<LiveSuggestionView[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await liveAnalysisApi.suggestions(period)
      setItems(r.data.items)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const timeline: TimelineItem[] = items.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: `${s.message} 建议：${s.action}`,
    tone: PRIORITY_TONE[s.priority] || 'idle',
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodPicker period={period} setPeriod={setPeriod} />
        <PremiumButton variant="secondary" onClick={() => void load()}>
          刷新建议
        </PremiumButton>
      </div>

      <GlowBorder>
        <PremiumCard title="经营建议" subtitle="像店长安排工作一样，能照着做">
          <p className="mb-4 text-sm text-slate-600">
            建议根据已导入的直播数据生成，不贬低主播，重点是下一步怎么干。
          </p>
          {loading ? (
            <p className="text-sm text-slate-500">生成中…</p>
          ) : (
            <TimelinePanel title="" items={timeline} emptyTitle="暂无建议，先导入一些直播数据" />
          )}
        </PremiumCard>
      </GlowBorder>
    </div>
  )
}
