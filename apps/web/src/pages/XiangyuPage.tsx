import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { XiangyuAccessQrDialog, XiangyuAccessQrFab } from '@/components/XiangyuAccessQrDialog'

const PROXY_PATH = '/xiangyu-proxy/'

async function fetchXiangyuOnline(): Promise<{ online: boolean; message: string }> {
  try {
    const res = await fetch(`${PROXY_PATH}api/health`, { credentials: 'omit' })
    if (!res.ok) return { online: false, message: '祥钰系统未响应' }
    const data = (await res.json()) as { ok?: boolean; service?: string }
    if (data.ok) return { online: true, message: '' }
    return { online: false, message: '祥钰系统未就绪' }
  } catch {
    return { online: false, message: '无法连接祥钰系统，请确认服务已启动' }
  }
}

export const XiangyuPage: React.FC = () => {
  const [online, setOnline] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)
  const [qrOpen, setQrOpen] = useState(true)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchXiangyuOnline()
      setOnline(r.online)
      setMessage(r.message)
    } catch (e) {
      setOnline(false)
      setMessage(e instanceof Error ? e.message : '无法获取祥钰系统状态')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    if (online !== true) return
    setIframeKey((k) => k + 1)
  }, [online])

  useEffect(() => {
    if (online !== true) return
    setQrOpen(true)
  }, [online])

  if (loading) {
    return <p className="p-6 text-center text-sm text-slate-500">正在连接祥钰系统…</p>
  }

  if (online === false) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <p className="text-sm text-slate-600">{message || '祥钰系统未启动'}</p>
        <p className="text-xs text-slate-400">
          请确认千帆 DevTools 已开启，后端会自动拉起祥钰 Web 与 Bridge
        </p>
        <button
          type="button"
          onClick={() => void loadStatus()}
          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm text-slate-700"
        >
          <RefreshCw size={14} />
          重试
        </button>
      </div>
    )
  }

  return (
    <>
      <XiangyuAccessQrDialog open={qrOpen} onClose={() => setQrOpen(false)} />
      {!qrOpen && <XiangyuAccessQrFab onClick={() => setQrOpen(true)} />}

      <div className="flex h-[calc(100dvh-3.75rem)] min-h-0 flex-col sm:h-[calc(100dvh-4.25rem)]">
        <iframe
          key={iframeKey}
          src={PROXY_PATH}
          title="祥钰珠宝 - 打包拍照发送"
          className="min-h-0 w-full flex-1 border-0 bg-white"
          allow="camera; microphone"
        />
      </div>
    </>
  )
}
