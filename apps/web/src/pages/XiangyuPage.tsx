import React, { useCallback, useEffect, useState } from 'react'

import { RefreshCw } from 'lucide-react'

import { XiangyuAccessQrDialog, XiangyuAccessQrFab } from '@/components/XiangyuAccessQrDialog'
import { settingsApi } from '@/api/endpoints'
import { useAuth } from '@/context/AuthContext'

const PROXY_PATH = '/xiangyu-proxy/'

export const XiangyuPage: React.FC = () => {
  const { loading: authLoading, authed } = useAuth()
  const [online, setOnline] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)
  const [qrOpen, setQrOpen] = useState(true)

  const loadStatus = useCallback(async () => {
    if (!authed) return
    setLoading(true)
    try {
      const r = await settingsApi.status()
      setOnline(r.data.xiangyu?.online ?? false)
      setMessage(r.data.xiangyu?.message ?? '')
    } catch (e) {
      setOnline(false)
      setMessage(e instanceof Error ? e.message : '无法获取祥钰系统状态')
    } finally {
      setLoading(false)
    }
  }, [authed])

  useEffect(() => {
    if (authLoading) return
    if (!authed) {
      setLoading(false)
      setOnline(false)
      setMessage('请先在「出库入库」页登录本系统后再使用打包拍照')
      return
    }
    void loadStatus()
  }, [authLoading, authed, loadStatus])

  useEffect(() => {
    if (authLoading || !authed || online !== true) return
    setIframeKey((k) => k + 1)
  }, [authLoading, authed, online])

  useEffect(() => {
    if (authLoading || !authed || online !== true) return
    setQrOpen(true)
  }, [authLoading, authed, online])

  if (authLoading || loading) {
    return <p className="p-6 text-center text-sm text-slate-500">正在连接祥钰系统…</p>
  }

  if (!authed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-slate-700">请使用右上角已登录的账号，无需单独注册祥钰账号。</p>
        <p className="text-xs text-slate-500">{message || '若刚登录，请稍候再切换到此页。'}</p>
      </div>
    )
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

      <div className="flex h-[calc(100dvh-5.25rem)] min-h-0 flex-col">
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
