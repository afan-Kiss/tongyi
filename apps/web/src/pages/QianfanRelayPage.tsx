import React, { useCallback, useEffect, useState } from 'react'
import { platformApi } from '@/api/endpoints'
import { StatCard } from '@/components/ui/StatCard'

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {label}
    </span>
  )
}

export const QianfanRelayPage: React.FC = () => {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof platformApi.qianfanStatus>>['data'] | null>(null)
  const [messages, setMessages] = useState<Record<string, unknown>[]>([])
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([])
  const [diagnose, setDiagnose] = useState<Awaited<ReturnType<typeof platformApi.qianfanDiagnose>>['data'] | null>(null)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [sendText, setSendText] = useState({ buyerNick: '', text: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const [s, m, n] = await Promise.all([
        platformApi.qianfanStatus(),
        platformApi.qianfanMessages(20),
        platformApi.qianfanNotifications(20),
      ])
      setStatus(s.data)
      setMessages((m.data.recent || []) as Record<string, unknown>[])
      setNotifications((n.data.items || []) as Record<string, unknown>[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 8000)
    return () => clearInterval(timer)
  }, [load])

  const runAction = async (action: 'start' | 'stop' | 'restart' | 'diagnose') => {
    setBusy(true)
    setActionMsg('')
    try {
      if (action === 'diagnose') {
        const r = await platformApi.qianfanDiagnose()
        setDiagnose(r.data)
        setActionMsg(r.data.summary)
      } else if (action === 'start') {
        const r = await platformApi.qianfanStart()
        setActionMsg(r.message || r.data.message)
      } else if (action === 'stop') {
        const r = await platformApi.qianfanStop()
        setActionMsg(r.message || r.data.message)
      } else {
        const r = await platformApi.qianfanRestart()
        setActionMsg(r.message || r.data.message)
      }
      await load()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const submitSendText = async () => {
    if (!sendText.buyerNick.trim() || !sendText.text.trim()) {
      setActionMsg('请填写买家昵称和文字内容（必须锁定明确买家）')
      return
    }
    setBusy(true)
    try {
      const r = await platformApi.qianfanSendText(sendText)
      setActionMsg(r.message || r.data.message)
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : '发送失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">千帆客服</h2>
          <p className="text-sm text-slate-500">监听四店买家消息，微信通知与回复中转</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="rounded-full border px-3 py-1.5 text-sm" onClick={() => void runAction('diagnose')}>
            一键诊断
          </button>
          <button type="button" disabled={busy} className="rounded-full border px-3 py-1.5 text-sm" onClick={() => void runAction('start')}>
            启动
          </button>
          <button type="button" disabled={busy} className="rounded-full border px-3 py-1.5 text-sm" onClick={() => void runAction('stop')}>
            停止
          </button>
          <button type="button" disabled={busy} className="rounded-full bg-rose-500 px-3 py-1.5 text-sm text-white" onClick={() => void runAction('restart')}>
            重启
          </button>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {actionMsg && <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{actionMsg}</div>}

      {status && (
        <>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge ok={status.running} label={status.running ? '运行中' : '未启动'} />
              <span className="text-sm text-slate-600">{status.plainSummary}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard title="DevTools" value={status.devtoolsReachable ? '可访问' : '不可访问'} hint={`端口 ${status.devtoolsPort}`} accent={status.devtoolsReachable ? 'from-emerald-400 to-teal-300' : 'from-amber-400 to-orange-300'} />
              <StatCard title="店铺识别" value={`${status.attachedShopCount}/${status.expectedShopCount}`} hint="四店监听" accent="from-sky-400 to-blue-300" />
              <StatCard title="Pending" value={status.pendingCount} hint="待回复/去重" accent="from-violet-400 to-purple-300" />
              <StatCard title="微信通道" value={status.wechatReady ? '就绪' : '未就绪'} hint={`API ${status.localApiPort}`} accent={status.wechatReady ? 'from-emerald-400 to-teal-300' : 'from-slate-400 to-slate-300'} />
            </div>
          </div>

          <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">四店监听状态</h3>
            {status.shops?.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {status.shops.map((shop) => (
                  <div key={`${shop.name}-${shop.appCid}`} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
                    <div className="font-medium text-slate-800">{shop.name}</div>
                    <div className="text-xs text-slate-500">{shop.appCid || '未识别 appCid'}</div>
                    <div className="mt-1 text-xs">{shop.ready ? '已识别' : '未就绪'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">暂未识别到店铺，请确认千帆客服台已打开四店页面</p>
            )}
          </section>
        </>
      )}

      {diagnose?.items?.length ? (
        <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">诊断结果</h3>
          <ul className="space-y-2">
            {diagnose.items.map((item, idx) => (
              <li key={idx} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <div className="font-medium">{item.title}</div>
                <div className="text-slate-600">{item.message}</div>
                {item.suggestion && <div className="mt-1 text-xs text-amber-700">{item.suggestion}</div>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">最近买家消息 / Pending</h3>
          <ul className="max-h-72 space-y-2 overflow-auto text-sm">
            {messages.length ? messages.map((m, i) => (
              <li key={String(m.id || i)} className="rounded-lg bg-slate-50 px-2 py-1.5">
                <div className="font-medium">{String(m.buyerNick || '未知买家')} · {String(m.shopName || '未知店铺')}</div>
                <div className="text-slate-600">{String(m.text || '')}</div>
              </li>
            )) : <li className="text-slate-500">暂无消息</li>}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">最近微信通知</h3>
          <ul className="max-h-72 space-y-2 overflow-auto text-sm">
            {notifications.length ? notifications.map((n, i) => (
              <li key={i} className="rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                {JSON.stringify(n).slice(0, 240)}
              </li>
            )) : <li className="text-slate-500">暂无通知记录</li>}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">发送文字测试（必须指定买家）</h3>
        <div className="grid gap-2 md:grid-cols-3">
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="买家昵称" value={sendText.buyerNick} onChange={(e) => setSendText((s) => ({ ...s, buyerNick: e.target.value }))} />
          <input className="rounded-xl border px-3 py-2 text-sm md:col-span-2" placeholder="文字内容" value={sendText.text} onChange={(e) => setSendText((s) => ({ ...s, text: e.target.value }))} />
        </div>
        <button type="button" disabled={busy} className="mt-2 rounded-full bg-slate-800 px-4 py-2 text-sm text-white" onClick={() => void submitSendText()}>
          创建发送任务
        </button>
      </section>
    </div>
  )
}
