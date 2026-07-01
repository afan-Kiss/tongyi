import React, { useCallback, useEffect, useState } from 'react'
import { platformApi } from '@/api/endpoints'
import { StatCard } from '@/components/ui/StatCard'

export const AgentCenterPage: React.FC = () => {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof platformApi.agentStatus>>['data'] | null>(null)
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof platformApi.agentTasks>>['data']['tasks']>([])
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">本地助手</h2>
        <p className="text-sm text-slate-500">本机 Excel、打印、千帆、图片上传由本地助手执行，服务器只派发任务</p>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg && <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{msg}</div>}

      {overview && (
        <>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <p className="mb-3 text-sm text-slate-700">{overview.summary}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard title="在线助手" value={overview.onlineCount} hint={`共 ${overview.totalCount} 台注册`} accent="from-emerald-400 to-teal-300" />
              <StatCard title="状态" value={overview.hasOnlineAgent ? '可用' : '离线'} hint="离线时不影响扫码" accent={overview.hasOnlineAgent ? 'from-sky-400 to-blue-300' : 'from-amber-400 to-orange-300'} />
            </div>
          </div>

          <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">已注册机器</h3>
            {overview.machines.length ? (
              <div className="space-y-2">
                {overview.machines.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium">{m.name}</div>
                      <span className={`text-xs ${m.online ? 'text-emerald-700' : 'text-amber-700'}`}>{m.statusLabel}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">机器码 {m.machineCode} · 心跳 {m.lastSeenAt ? new Date(m.lastSeenAt).toLocaleString() : '从未'}</div>
                    <div className="mt-1 text-xs text-slate-500">能力：{m.capabilities.length ? m.capabilities.join('、') : '未上报'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">还没有本地助手注册。请在本机运行 local-agent 脚本或未来 EXE。</p>
            )}
          </section>
        </>
      )}

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">任务列表</h3>
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
                  <td className="py-2 pr-3">{t.statusLabel}{t.errorMessage ? ` · ${t.errorMessage}` : ''}</td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="py-2">
                    {['failed', 'retryable_failed'].includes(t.status) && (
                      <button type="button" className="text-xs text-rose-600" onClick={() => void retryTask(t.id)}>
                        重试
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!tasks.length && (
                <tr><td colSpan={4} className="py-4 text-slate-500">暂无任务</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
