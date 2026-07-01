import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { platformApi } from '@/api/endpoints'
import {
  EmptyState,
  GlowBorder,
  HealthOrb,
  PremiumButton,
  PremiumCard,
  PremiumPage,
  PremiumStatCard,
  PulseBar,
  SkeletonList,
  SkeletonTable,
} from '@/components/premium'

const CAP_LABELS: Record<string, string> = {
  excel: 'Excel',
  print: '打印',
  qianfan: '千帆',
  'file-upload': '图片上传',
}

export const AgentCenterPage: React.FC = () => {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof platformApi.agentStatus>>['data'] | null>(null)
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof platformApi.agentTasks>>['data']['tasks']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const [status, taskRes] = await Promise.all([platformApi.agentStatus(), platformApi.agentTasks(30)])
      setOverview(status.data)
      setTasks(taskRes.data.tasks)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [load])

  const retryTask = async (id: string) => {
    try {
      await platformApi.retryAgentTask(id)
      setMsg('任务已重新排队')
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '重试失败')
    }
  }

  const runningCount = useMemo(() => tasks.filter((t) => t.status === 'running').length, [tasks])

  return (
    <PremiumPage title="本地助手" subtitle="本机 Excel、打印、千帆、图片上传由本地助手执行。服务器只派发任务。">
      {error ? <PremiumCard tone="danger"><p className="text-sm text-red-700">{error}</p></PremiumCard> : null}
      {msg ? <PremiumCard tone="info"><p className="text-sm text-sky-800">{msg}</p></PremiumCard> : null}

      {loading && !overview ? (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <SkeletonList rows={2} />
          <SkeletonTable rows={5} />
        </div>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <PremiumCard tone={overview.hasOnlineAgent ? 'ok' : 'warn'} className="flex flex-col items-center justify-center py-6">
              <HealthOrb
                value={overview.hasOnlineAgent ? `${overview.onlineCount}` : '离线'}
                label={overview.hasOnlineAgent ? '在线助手' : '助手离线'}
                tone={overview.hasOnlineAgent ? 'ok' : 'warn'}
                size="lg"
              />
              <p className="mt-4 px-2 text-center text-xs leading-relaxed text-slate-500">{overview.summary}</p>
            </PremiumCard>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <PremiumStatCard title="在线助手" value={overview.onlineCount} unit="台" hint={`共 ${overview.totalCount} 台注册`} status={overview.hasOnlineAgent ? 'online' : 'warning'} accent="from-emerald-400 to-teal-300" />
                <PremiumStatCard title="执行中任务" value={runningCount} hint="正在本地执行" status={runningCount > 0 ? 'online' : 'idle'} accent="from-sky-400 to-blue-300" />
              </div>
              {runningCount > 0 ? <PulseBar mode="active" label="本地任务执行中" /> : null}
            </div>
          </div>

          <PremiumCard title="已注册机器">
            {overview.machines.length ? (
              <div className="space-y-3">
                {overview.machines.map((m) => (
                  <GlowBorder key={m.id} tone={m.online ? 'ok' : 'warn'} innerClassName="p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-800">{m.name}</div>
                        <div className="mt-1 text-xs text-slate-500">机器码 {m.machineCode}</div>
                        <div className="mt-1 text-xs text-slate-500">心跳 {m.lastSeenAt ? new Date(m.lastSeenAt).toLocaleString() : '从未'}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(m.capabilities.length ? m.capabilities : ['excel', 'print', 'qianfan', 'file-upload']).map((cap) => (
                            <span key={cap} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                              {CAP_LABELS[cap] || cap}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className={`text-xs font-medium ${m.online ? 'text-emerald-700' : 'text-amber-700'}`}>{m.statusLabel}</span>
                    </div>
                  </GlowBorder>
                ))}
              </div>
            ) : (
              <EmptyState
                title="还没有本地助手在线"
                description="请在本机运行 npm run local-agent，或等待未来 Windows EXE。离线时不影响扫码出库。"
              />
            )}
          </PremiumCard>

          <PremiumCard title="任务流" subtitle="失败任务可重试；服务器不会直接操作本机 Excel/打印机">
            <div className="overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="py-2 pr-3">类型</th>
                    <th className="py-2 pr-3">状态</th>
                    <th className="py-2 pr-3">时间</th>
                    <th className="py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3">{t.typeLabel}</td>
                      <td className="py-2 pr-3">
                        {t.status === 'running' ? (
                          <div className="space-y-1">
                            <span>{t.statusLabel}</span>
                            <PulseBar mode="active" />
                          </div>
                        ) : (
                          <span>{t.statusLabel}{t.errorMessage ? ` · ${t.errorMessage}` : ''}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                      <td className="py-2">
                        {['failed', 'retryable_failed'].includes(t.status) ? (
                          <PremiumButton variant="danger" className="px-2 py-1 text-xs" onClick={() => void retryTask(t.id)}>
                            重试
                          </PremiumButton>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {!tasks.length && (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState title="暂无任务" description="启停千帆、Excel、打印等操作会在这里显示。" compact />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </PremiumCard>
        </>
      ) : null}
    </PremiumPage>
  )
}
