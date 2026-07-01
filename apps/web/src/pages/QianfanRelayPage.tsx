import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Headphones, MessageSquare, Radio, Store, Stethoscope } from 'lucide-react'
import { platformApi } from '@/api/endpoints'
import {
  BreathingDot,
  EmptyState,
  GlowBorder,
  HealthOrb,
  PremiumButton,
  PremiumCard,
  PremiumPage,
  PremiumStatCard,
  PulseBar,
  SkeletonCard,
  TimelinePanel,
  type TimelineItem,
} from '@/components/premium'

export const QianfanRelayPage: React.FC = () => {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof platformApi.qianfanStatus>>['data'] | null>(null)
  const [messages, setMessages] = useState<Record<string, unknown>[]>([])
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([])
  const [diagnose, setDiagnose] = useState<Awaited<ReturnType<typeof platformApi.qianfanDiagnose>>['data'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [sendText, setSendText] = useState({
    shopTitle: '',
    buyerNick: '',
    appCid: '',
    receiverAppUids: '',
    text: '',
  })
  const [sendJobs, setSendJobs] = useState<Awaited<ReturnType<typeof platformApi.qianfanSendJobs>>['data']['jobs']>([])
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
      const jobsRes = await platformApi.qianfanSendJobs(20)
      setSendJobs(jobsRes.data.jobs)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
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
    const receiverAppUids = sendText.receiverAppUids
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!sendText.shopTitle.trim() || !sendText.buyerNick.trim() || !sendText.appCid.trim()) {
      setActionMsg('请填写店铺、买家昵称、appCid（必须锁定明确买家）')
      return
    }
    if (!receiverAppUids.length) {
      setActionMsg('请填写 receiverAppUids，不能只靠最近会话')
      return
    }
    if (!sendText.text.trim()) {
      setActionMsg('请填写文字内容')
      return
    }
    setBusy(true)
    try {
      const r = await platformApi.qianfanSendText({
        shopTitle: sendText.shopTitle.trim(),
        buyerNick: sendText.buyerNick.trim(),
        appCid: sendText.appCid.trim(),
        receiverAppUids,
        text: sendText.text.trim(),
        source: 'test',
      })
      setActionMsg(r.message || '已创建发送任务，等待本地助手执行（未确认前不会显示已发送）')
      await load()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : '创建任务失败')
    } finally {
      setBusy(false)
    }
  }

  const retrySendJob = async (id: string) => {
    setBusy(true)
    try {
      const r = await platformApi.retryQianfanSendJob(id)
      setActionMsg(r.message || '已重新排队')
      await load()
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : '重试失败')
    } finally {
      setBusy(false)
    }
  }

  const messageTimeline: TimelineItem[] = useMemo(
    () =>
      messages.map((m, i) => ({
        id: String(m.id || i),
        title: `${String(m.buyerNick || '未知买家')} · ${String(m.shopName || '未知店铺')}`,
        subtitle: String(m.text || ''),
        tone: m.source === 'pending' ? 'warning' : 'online',
      })),
    [messages],
  )

  const notifyTimeline: TimelineItem[] = useMemo(
    () =>
      notifications.slice(0, 12).map((n, i) => ({
        id: `n-${i}`,
        title: String(n.type || n.event || '微信通知'),
        subtitle: JSON.stringify(n).slice(0, 180),
        tone: 'idle',
      })),
    [notifications],
  )

  const pulseMode = status?.running && status.listenerReady ? 'active' : status?.running ? 'paused' : 'error'

  return (
    <PremiumPage
      title="千帆客服中转"
      subtitle="监听四店买家消息，微信通知与回复中转。外部失败不影响扫码。"
      actions={
        <>
          <PremiumButton variant="secondary" loading={busy} onClick={() => void runAction('diagnose')}>
            <Stethoscope size={14} /> 一键诊断
          </PremiumButton>
          <PremiumButton variant="secondary" loading={busy} onClick={() => void runAction('start')}>启动</PremiumButton>
          <PremiumButton variant="ghost" loading={busy} onClick={() => void runAction('stop')}>停止</PremiumButton>
          <PremiumButton variant="primary" loading={busy} onClick={() => void runAction('restart')}>重启</PremiumButton>
        </>
      }
    >
      {error ? (
        <GlowBorder tone="error"><div className="p-4 text-sm text-red-700">{error}</div></GlowBorder>
      ) : null}
      {actionMsg ? (
        <PremiumCard tone="info"><p className="text-sm text-sky-800">{actionMsg}</p></PremiumCard>
      ) : null}

      {loading && !status ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : null}

      {status ? (
        <div className="premium-stagger space-y-4" style={{ ['--i' as string]: 0 }}>
          <PremiumCard tone={status.running ? 'ok' : 'warn'}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <BreathingDot tone={status.running ? 'online' : 'error'} label={status.running ? '运行中' : '未启动'} />
              <span className="text-sm text-slate-600">{status.plainSummary}</span>
            </div>
            <PulseBar
              mode={pulseMode}
              label={pulseMode === 'active' ? '监听运行中' : pulseMode === 'paused' ? '已启动，等待店铺/消息就绪' : '未在监听'}
            />
          </PremiumCard>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <PremiumStatCard title="千帆中转" value={status.running ? '运行' : '停止'} hint={status.rootExists ? '路径已找到' : '路径未配置'} status={status.running ? 'online' : 'error'} icon={Headphones} accent="from-rose-500 to-pink-400" />
            <PremiumStatCard title="店铺接入" value={`${status.attachedShopCount}/${status.expectedShopCount}`} hint="四店监听" status={status.attachedShopCount >= status.expectedShopCount ? 'online' : 'warning'} icon={Store} accent="from-sky-400 to-blue-300" />
            <PremiumStatCard title="微信通知" value={status.wechatReady ? '就绪' : '未就绪'} hint={`API ${status.localApiPort}`} status={status.wechatReady ? 'online' : 'warning'} icon={MessageSquare} accent="from-emerald-400 to-teal-300" />
            <PremiumStatCard title="待回复" value={status.pendingCount} hint="Pending / 去重队列" status={status.pendingCount > 15 ? 'error' : status.pendingCount > 0 ? 'warning' : 'online'} icon={Radio} accent="from-violet-400 to-purple-300" />
          </div>

          <PremiumCard title="四店健康状态" subtitle="DevTools 9322 · 上次买家消息 · 店铺识别">
            {status.shops?.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {status.shops.map((shop) => (
                  <GlowBorder key={`${shop.name}-${shop.appCid}`} tone={shop.ready ? 'ok' : 'warn'} innerClassName="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-800">{shop.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{shop.appCid || '未识别 appCid'}</div>
                        <div className="mt-2 text-xs text-slate-500">DevTools {status.devtoolsReachable ? '可访问' : '不可访问'}</div>
                      </div>
                      <HealthOrb value={shop.ready ? 'OK' : '—'} label={shop.ready ? '已识别' : '未就绪'} tone={shop.ready ? 'ok' : 'warn'} size="sm" />
                    </div>
                  </GlowBorder>
                ))}
              </div>
            ) : (
              <EmptyState title="暂未识别到店铺" description="请确认千帆客服台已打开四个店铺页面，并用调试模式启动。" />
            )}
          </PremiumCard>
        </div>
      ) : null}

      {diagnose?.items?.length ? (
        <PremiumCard title="诊断结果" tone={diagnose.ok ? 'ok' : 'warn'}>
          <div className="space-y-2">
            {diagnose.items.map((item, idx) => (
              <GlowBorder key={idx} tone={item.level === 'error' ? 'error' : item.level === 'warn' ? 'warn' : 'info'} innerClassName="p-3">
                <div className="text-sm font-medium text-slate-800">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.message}</div>
                {item.suggestion ? <div className="mt-1 text-xs text-amber-700">{item.suggestion}</div> : null}
              </GlowBorder>
            ))}
          </div>
        </PremiumCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PremiumCard><TimelinePanel title="最近买家消息 / Pending" items={messageTimeline} emptyTitle="暂无买家消息" emptyDescription="千帆未启动或还没收到新消息。" /></PremiumCard>
        <PremiumCard><TimelinePanel title="最近微信通知" items={notifyTimeline} emptyTitle="暂无微信通知" emptyDescription="通知通道未就绪或今天还没有通知。" /></PremiumCard>
      </div>

      <GlowBorder tone="warn" innerClassName="p-4">
        <PremiumCard hover={false} title="发送文字测试" subtitle="必须锁定明确买家，不允许猜最近会话">
          <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            安全要求：必须填写 shopTitle、buyerNick、appCid、receiverAppUids。只有状态为「已发送」才表示千帆确认收到。
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input className="premium-input" placeholder="店铺名称 shopTitle（必填）" value={sendText.shopTitle} onChange={(e) => setSendText((s) => ({ ...s, shopTitle: e.target.value }))} />
            <input className="premium-input" placeholder="买家昵称 buyerNick（必填）" value={sendText.buyerNick} onChange={(e) => setSendText((s) => ({ ...s, buyerNick: e.target.value }))} />
            <input className="premium-input" placeholder="appCid（必填）" value={sendText.appCid} onChange={(e) => setSendText((s) => ({ ...s, appCid: e.target.value }))} />
            <input className="premium-input" placeholder="receiverAppUids，逗号分隔（必填）" value={sendText.receiverAppUids} onChange={(e) => setSendText((s) => ({ ...s, receiverAppUids: e.target.value }))} />
            <input className="premium-input md:col-span-2" placeholder="文字内容" value={sendText.text} onChange={(e) => setSendText((s) => ({ ...s, text: e.target.value }))} />
          </div>
          <PremiumButton variant="primary" className="mt-3" loading={busy} onClick={() => void submitSendText()}>
            创建发送任务
          </PremiumButton>
        </PremiumCard>
      </GlowBorder>

      <PremiumCard title="发送任务" subtitle="任务制链路：创建 → 锁定买家 → 发送 → 等待确认 → 已发送">
        {sendJobs.length ? (
          <div className="space-y-3">
            {sendJobs.map((job) => (
              <GlowBorder key={job.id} tone={job.isSent ? 'ok' : job.status === 'target_blocked' ? 'error' : 'warn'} innerClassName="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-800">{job.buyerNick} · {job.shopTitle}</div>
                    <div className="mt-1 text-xs text-slate-500">{job.messageType === 'text' ? '文字' : '图片'} · {job.statusLabel}</div>
                    {job.plainError ? <div className="mt-1 text-xs text-amber-800">{job.plainError}</div> : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {job.statusFlow.map((step) => (
                        <span
                          key={step.label}
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            step.failed ? 'bg-red-100 text-red-700' : step.done ? 'bg-emerald-100 text-emerald-700' : step.active ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {step.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!job.isSent && ['failed', 'dead_letter', 'retrying'].includes(job.status) ? (
                    <PremiumButton variant="secondary" className="px-2 py-1 text-xs" onClick={() => void retrySendJob(job.id)}>
                      手动重试
                    </PremiumButton>
                  ) : null}
                </div>
              </GlowBorder>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无发送任务" description="创建测试发送后，这里会显示真实状态（不会假成功）。" compact />
        )}
      </PremiumCard>
    </PremiumPage>
  )
}
