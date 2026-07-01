import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Check, X } from 'lucide-react'
import { api, authApi, type AppSettings, type SystemStatus } from '@/lib/api'
import { LabelPrintDebugPanel } from '@/components/LabelPrintDebugPanel'

const PORTAL_PATH = '/inventory'

function pickLanIp(ips: string[]): string | null {
  if (!ips.length) return null
  const score = (ip: string) => {
    if (ip.startsWith('192.168.')) return 0
    if (ip.startsWith('10.')) return 1
    if (ip.startsWith('172.')) return 3
    return 2
  }
  return [...ips].sort((a, b) => score(a) - score(b))[0] ?? null
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/duckdns\.org/i.test(trimmed)) return `https://${trimmed}`
  return `http://${trimmed}`
}

function AccessQrCard({
  title,
  hint,
  url,
  qrDataUrl,
  emptyText,
  copied,
  onCopy,
}: {
  title: string
  hint: string
  url: string
  qrDataUrl: string
  emptyText?: string
  copied: boolean
  onCopy: (url: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl border border-rose-50 bg-rose-50/20 p-4">
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <p className="mt-1 text-center text-[11px] text-slate-500">{hint}</p>
      {qrDataUrl ? (
        <img src={qrDataUrl} alt={`${title}二维码`} className="mt-3 rounded-xl border border-rose-100 bg-white p-1" />
      ) : (
        <div className="mt-3 flex h-[180px] w-[180px] items-center justify-center rounded-xl border border-dashed border-rose-100 bg-white/60 px-3 text-center text-[11px] text-slate-400">
          {emptyText || '暂无地址'}
        </div>
      )}
      {url ? (
        <button
          type="button"
          onClick={() => onCopy(url)}
          className="mt-3 w-full break-all rounded-xl border border-rose-100 bg-white px-3 py-2 text-left text-xs text-rose-600 transition hover:bg-rose-50"
        >
          {url}
        </button>
      ) : (
        <p className="mt-3 text-center text-[11px] text-slate-400">{emptyText}</p>
      )}
      {copied && (
        <p className="mt-2 text-xs font-medium text-emerald-600">已复制</p>
      )}
    </div>
  )
}

function ServiceStatusLine({
  label,
  online,
  message,
}: {
  label: string
  online: boolean
  message: string
}) {
  return (
    <div className={`flex items-start gap-2 text-xs ${online ? 'text-emerald-600' : 'text-red-600'}`}>
      {online ? (
        <Check size={15} className="mt-0.5 shrink-0 stroke-[2.5]" aria-hidden />
      ) : (
        <X size={15} className="mt-0.5 shrink-0 stroke-[2.5]" aria-hidden />
      )}
      <span>
        <span className="font-medium">{label}：</span>
        {message}
      </span>
    </div>
  )
}

function mergePrintAgentStatus(prev: SystemStatus | null, next: SystemStatus): SystemStatus {
  if (next.printAgent.online || !prev?.printAgent.online) return next
  // 连续两次探测失败才显示离线，避免打印忙时界面闪红
  return { ...next, printAgent: prev.printAgent }
}

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const printAgentOfflineStreak = useRef(0)
  const [lanQr, setLanQr] = useState('')
  const [msg, setMsg] = useState('')
  const [copiedUrl, setCopiedUrl] = useState('')
  const [restartingPrint, setRestartingPrint] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [displayNameLoaded, setDisplayNameLoaded] = useState(false)
  const [displayNameSaveHint, setDisplayNameSaveHint] = useState('')
  const savedDisplayNameRef = useRef('')
  const displayNameDraftRef = useRef('')
  const saveDisplayNameTimer = useRef<number | null>(null)

  const port = status?.port || 1212
  const lanIp = useMemo(() => pickLanIp(status?.lanIps || []), [status?.lanIps])
  const lanBase = lanIp ? `http://${lanIp}:${port}` : `http://127.0.0.1:${port}`
  const lanUrl = `${lanBase}${PORTAL_PATH}`

  const applyStatus = useCallback((next: SystemStatus) => {
    setStatus((prev) => {
      if (next.printAgent.online) {
        printAgentOfflineStreak.current = 0
        return next
      }
      printAgentOfflineStreak.current += 1
      if (prev?.printAgent.online && printAgentOfflineStreak.current < 2) {
        return mergePrintAgentStatus(prev, next)
      }
      return next
    })
  }, [])

  useEffect(() => {
    const load = () => {
      Promise.all([api.getSettings(), api.getStatus(), authApi.profile()])
        .then(([s, st, profile]) => {
          setSettings(s.data)
          const dn = String(profile.data.displayName || '').trim()
          setDisplayName(dn)
          displayNameDraftRef.current = dn
          savedDisplayNameRef.current = dn
          setDisplayNameLoaded(true)
          printAgentOfflineStreak.current = 0
          setStatus(st.data)
        })
        .catch((e) => setMsg(e.message))
    }
    load()
    const timer = window.setInterval(() => {
      api.getStatus().then((st) => applyStatus(st.data)).catch(() => {})
    }, 10000)
    return () => window.clearInterval(timer)
  }, [applyStatus])

  useEffect(() => {
    if (!lanUrl) return
    QRCode.toDataURL(lanUrl, { width: 180, margin: 1 }).then(setLanQr).catch(() => setLanQr(''))
  }, [lanUrl])

  const persistDisplayName = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (trimmed === savedDisplayNameRef.current) return
    try {
      const r = await authApi.saveProfile(trimmed)
      savedDisplayNameRef.current = trimmed
      setDisplayName(trimmed)
      displayNameDraftRef.current = trimmed
      setDisplayNameSaveHint('已保存')
      window.dispatchEvent(new CustomEvent('user-profile:updated', { detail: r.data }))
      window.setTimeout(() => setDisplayNameSaveHint(''), 2000)
    } catch (e) {
      setDisplayNameSaveHint(e instanceof Error ? e.message : '保存失败')
    }
  }, [])

  const scheduleDisplayNameSave = useCallback(
    (name: string) => {
      displayNameDraftRef.current = name
      if (saveDisplayNameTimer.current) window.clearTimeout(saveDisplayNameTimer.current)
      saveDisplayNameTimer.current = window.setTimeout(() => {
        saveDisplayNameTimer.current = null
        void persistDisplayName(name)
      }, 600)
    },
    [persistDisplayName],
  )

  useEffect(() => {
    return () => {
      if (saveDisplayNameTimer.current) window.clearTimeout(saveDisplayNameTimer.current)
    }
  }, [])

  const copyUrl = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl((prev) => (prev === url ? '' : prev)), 2000)
    } catch {
      setMsg('复制失败，请手动选择地址复制')
    }
  }, [])

  const save = async () => {
    if (!settings) return
    try {
      const r = await api.saveSettings({
        excelBridgeEnabled: true,
        printerName: settings.printerName,
        printerModel: settings.printerModel || 'PUQU_AQ00',
        photoWatermark: settings.photoWatermark,
      }) as { data: AppSettings }
      setSettings(r.data)
      setMsg('已保存')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const restartPrintAgent = async () => {
    setRestartingPrint(true)
    setMsg('')
    try {
      const r = await api.restartPrintAgent()
      const st = await api.getStatus()
      printAgentOfflineStreak.current = 0
      setStatus(st.data)
      setMsg(r.data.ok ? r.data.message : `重启失败：${r.data.message}`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setRestartingPrint(false)
    }
  }

  if (!settings || !displayNameLoaded) return <p className="text-sm text-slate-500">加载中...</p>

  const virtualIps = (status?.lanIps || []).filter((ip) => ip.startsWith('172.'))

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">系统设置</h2>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">操作员用户名</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          用于界面展示与操作识别，<strong>与登录账号、密码无关</strong>。每个登录账号各自保存，输入后自动保存。
        </p>
        <label className="mt-3 block text-sm">
          <span className="text-slate-500">显示用户名</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={displayName}
            onChange={(e) => {
              const v = e.target.value
              setDisplayName(v)
              scheduleDisplayNameSave(v)
            }}
            onBlur={() => {
              if (saveDisplayNameTimer.current) {
                window.clearTimeout(saveDisplayNameTimer.current)
                saveDisplayNameTimer.current = null
              }
              void persistDisplayName(displayNameDraftRef.current)
            }}
            placeholder="如：张三"
          />
        </label>
        {displayNameSaveHint && (
          <p className="mt-2 text-xs text-emerald-600">{displayNameSaveHint}</p>
        )}
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">网络访问（内网）</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          手机和电脑需连<strong>同一个 WiFi</strong>。扫码请用 Safari、Chrome 或手机自带相机，
          <strong className="text-amber-800">不要用微信扫一扫</strong>（微信无法打开摄像头）。
        </p>
        <p className="mt-2 text-xs text-slate-400">本机调试：http://127.0.0.1:{port}</p>
        {virtualIps.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">
            提示：{virtualIps.join('、')} 多为虚拟网卡（WSL/Hyper-V），请扫下方内网二维码。
          </p>
        )}

        <div className="mt-4">
          <AccessQrCard
            title="内网访问"
            hint="同 WiFi · 出库入库 / 手机拍照"
            url={lanUrl}
            qrDataUrl={lanQr}
            copied={copiedUrl === lanUrl}
            onCopy={copyUrl}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">璞趣 AQ00 标签机</h3>
        <p className="mt-1 text-xs text-slate-500">
          标签纸 <strong>25×70mm</strong> 珠宝吊牌，一次打印应只出 <strong>1 张</strong>。留空则自动识别名称含 AQ00/璞趣 的打印机。
        </p>
        <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          若一次打印出 <strong>3 张纸</strong>：请在<strong>璞趣桌面软件</strong>里把标签纸尺寸设为
          <strong> 宽 25mm × 长 70mm</strong>（不要设成 25×25）。我们的打印图高度约 70mm，驱动若按 25mm 走纸会走 3 次。
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-slate-500">Windows 打印机名称（与「设备和打印机」里一致）</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={settings.printerName || ''}
            onChange={(e) => setSettings({ ...settings, printerName: e.target.value, printerModel: 'PUQU_AQ00' })}
            placeholder="PUQU AQ00"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">商品照片水印</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          水印在<strong>查看时动态叠加</strong>，不写入原图文件，保存设置后刷新页面即可生效。历史已烧录水印的旧照片无法改样式，新上传的照片可随时调整。
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.photoWatermark?.enabled !== false}
            onChange={(e) =>
              setSettings({
                ...settings,
                photoWatermark: {
                  enabled: e.target.checked,
                  fontSizeBoost: settings.photoWatermark?.fontSizeBoost ?? 16,
                },
              })
            }
            className="rounded border-slate-300"
          />
          显示编号与时间水印
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-slate-500">字号加大（像素，默认 16 ≈ 大 4 号）</span>
          <input
            type="number"
            min={0}
            max={48}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={settings.photoWatermark?.fontSizeBoost ?? 16}
            onChange={(e) =>
              setSettings({
                ...settings,
                photoWatermark: {
                  enabled: settings.photoWatermark?.enabled !== false,
                  fontSizeBoost: Math.max(0, Math.min(48, Number(e.target.value) || 0)),
                },
              })
            }
          />
        </label>
      </section>

      <LabelPrintDebugPanel />

      {status && (
        <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">服务状态</h3>
          <div className="mt-3 space-y-2">
            {status.degraded && (
              <p className="text-xs text-amber-600">降级：{status.degradedReasons.join(' · ')}</p>
            )}
            <ServiceStatusLine
              label="Excel 桥接"
              online={status.excelBridge.online}
              message={status.excelBridge.message}
            />
            <ServiceStatusLine
              label="祥钰 Web"
              online={status.xiangyu.online}
              message={status.xiangyu.message}
            />
            {status.xiangyu.bridge && (
              <ServiceStatusLine
                label="千帆 Bridge"
                online={status.xiangyu.bridge.online}
                message={status.xiangyu.bridge.message}
              />
            )}
            <ServiceStatusLine
              label="打印 Agent"
              online={status.printAgent.online}
              message={status.printAgent.message}
            />
            {!status.printAgent.online && (
              <button
                type="button"
                disabled={restartingPrint}
                onClick={() => void restartPrintAgent()}
                className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                {restartingPrint ? '正在重启打印服务…' : '重启打印 Agent'}
              </button>
            )}
          </div>
        </section>
      )}

      <button type="button" onClick={save} className="w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-3 text-sm font-semibold text-white">
        保存设置
      </button>
      {msg && <p className="text-center text-sm text-slate-600">{msg}</p>}
    </div>
  )
}
