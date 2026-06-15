import React, { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, X } from 'lucide-react'
import { api, type AppSettings, type SystemStatus } from '@/lib/api'
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

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [lanQr, setLanQr] = useState('')
  const [publicQr, setPublicQr] = useState('')
  const [msg, setMsg] = useState('')
  const [copiedUrl, setCopiedUrl] = useState('')

  const port = status?.port || 4725
  const lanIp = useMemo(() => pickLanIp(status?.lanIps || []), [status?.lanIps])
  const lanBase = lanIp ? `http://${lanIp}:${port}` : `http://127.0.0.1:${port}`
  const lanUrl = `${lanBase}${PORTAL_PATH}`
  const publicBase = normalizeBaseUrl(settings?.publicUrl || '')
  const publicUrl = publicBase ? `${publicBase}${PORTAL_PATH}` : ''

  useEffect(() => {
    const load = () => {
      Promise.all([api.getSettings(), api.getStatus()])
        .then(([s, st]) => {
          setSettings(s.data)
          setStatus(st.data)
        })
        .catch((e) => setMsg(e.message))
    }
    load()
    const timer = window.setInterval(() => {
      api.getStatus().then((st) => setStatus(st.data)).catch(() => {})
    }, 10000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!lanUrl) return
    QRCode.toDataURL(lanUrl, { width: 180, margin: 1 }).then(setLanQr).catch(() => setLanQr(''))
  }, [lanUrl])

  useEffect(() => {
    if (!publicUrl) {
      setPublicQr('')
      return
    }
    QRCode.toDataURL(publicUrl, { width: 180, margin: 1 }).then(setPublicQr).catch(() => setPublicQr(''))
  }, [publicUrl])

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
        publicUrl: settings.publicUrl,
        excelBridgeEnabled: true,
        printerName: settings.printerName,
        printerModel: settings.printerModel || 'PUQU_AQ00',
      }) as { data: AppSettings }
      setSettings(r.data)
      setMsg('已保存')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  if (!settings) return <p className="text-sm text-slate-500">加载中...</p>

  const virtualIps = (status?.lanIps || []).filter((ip) => ip.startsWith('172.'))

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">系统设置</h2>

      <section className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">网络访问</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          <span className="font-medium text-slate-700">内网</span>：手机和电脑连<strong>同一个 WiFi</strong>时用（如 192.168.x.x），速度快。
          <br />
          <span className="font-medium text-slate-700">外网</span>：HTTPS 走 8443 端口（443 留给翻墙 x-ui），如 https://churuku.duckdns.org:8443
        </p>
        <p className="mt-2 text-xs text-slate-400">本机调试：http://127.0.0.1:{port}</p>
        {virtualIps.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">
            提示：{virtualIps.join('、')} 多为虚拟网卡（WSL/Hyper-V），手机请扫下方<strong>内网</strong>二维码，不要用这类地址。
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <AccessQrCard
            title="内网访问"
            hint="同 WiFi 扫码 · 出库入库首页"
            url={lanUrl}
            qrDataUrl={lanQr}
            copied={copiedUrl === lanUrl}
            onCopy={copyUrl}
          />
          <AccessQrCard
            title="外网访问"
            hint="HTTPS 外网 · 手机实时拍照请扫此码"
            url={publicUrl}
            qrDataUrl={publicQr}
            emptyText="请先填写外网地址并保存"
            copied={copiedUrl === publicUrl}
            onCopy={copyUrl}
          />
        </div>

        <label className="mt-4 block text-sm">
          <span className="text-slate-500">外网地址（HTTPS 域名，手机实时拍照必需）</span>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={settings.publicUrl}
            onChange={(e) => setSettings({ ...settings, publicUrl: e.target.value })}
            placeholder="https://churuku.duckdns.org:8443"
          />
        </label>
        <p className="mt-2 text-[11px] text-slate-400">
          保存后右侧外网二维码会自动更新。VPS 上需 nginx + certbot 配置 HTTPS，本机 frpc 已连接。
        </p>
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
