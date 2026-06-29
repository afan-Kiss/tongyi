import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { api, type DashboardStats } from '@/lib/api'
import { onInventoryRefresh } from '@/lib/inventoryRefresh'
import { OperationLogList } from '@/components/OperationLogList'
import type { OperationLog } from '@/api/types'

function mergeTodayLogs(stats: DashboardStats | null): OperationLog[] {
  if (!stats) return []
  const map = new Map<string, OperationLog>()
  for (const log of [...(stats.todayOutboundLogs || []), ...(stats.todayInboundLogs || [])]) {
    map.set(log.id, log)
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

const DISPLAY_LIMIT = 20

/** 今日记录优先，再用 recentLogs 补齐到 limit 条，按 id 去重、createdAt 倒序 */
function buildDisplayLogs(stats: DashboardStats | null, limit = DISPLAY_LIMIT): OperationLog[] {
  if (!stats) return []
  const map = new Map<string, OperationLog>()
  for (const log of mergeTodayLogs(stats)) {
    map.set(log.id, log)
  }
  for (const log of stats.recentLogs || []) {
    if (map.size >= limit) break
    if (!map.has(log.id)) map.set(log.id, log)
  }
  return [...map.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit)
}

type Props = {
  onOpenCert: (certNo: string) => void
}

export const ScanRecentOperationsPanel: React.FC<Props> = ({ onOpenCert }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [arkError, setArkError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api
      .stats()
      .then((r) => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => onInventoryRefresh(load), [load])

  const displayLogs = useMemo(() => buildDisplayLogs(stats), [stats])
  const todayTotal = (stats?.todayOutbound ?? 0) + (stats?.todayInbound ?? 0)

  return (
    <section
      className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm"
      data-no-scan-refocus
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">最近操作</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {todayTotal > 0
              ? `今日已处理 ${todayTotal} 笔（出库 ${stats?.todayOutbound ?? 0} · 入库 ${stats?.todayInbound ?? 0}）`
              : '今日暂无出入库，以下为最近记录'}
          </p>
        </div>
        <Link
          to="/inventory"
          className="shrink-0 text-xs text-rose-500 underline-offset-2 hover:underline"
        >
          经营总览
        </Link>
      </div>

      {loading && !stats ? (
        <p className="text-sm text-slate-400">加载中…</p>
      ) : (
        <>
          {arkError && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {arkError}
            </p>
          )}
          <OperationLogList
            logs={displayLogs}
            emptyText="暂无操作记录，扫码出库/入库后会显示在这里"
            onOpen={onOpenCert}
            showArkLink
            onArkError={setArkError}
          />
        </>
      )}
    </section>
  )
}
