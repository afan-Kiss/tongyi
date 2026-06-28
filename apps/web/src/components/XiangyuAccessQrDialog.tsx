import React, { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, X } from 'lucide-react'

import { buildLanXiangyuUrl, isSecureLanMobileCameraUrl } from '@/lib/photoRelayUrl'

interface MobileInfoResponse {
  data?: {
    lanIps?: string[]
    port?: number
    mobileHttpsPort?: number
  }
}

const SCAN_HINT =
  '请用 Safari、Chrome 或手机自带「相机」扫码打开，不要用微信扫一扫'

interface Props {
  open: boolean
  onClose: () => void
}

export const XiangyuAccessQrDialog: React.FC<Props> = ({ open, onClose }) => {
  const [pageUrl, setPageUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [httpsReady, setHttpsReady] = useState(true)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/v1/photo-relay/mobile-info')
        const json = (await res.json()) as MobileInfoResponse
        if (cancelled) return
        const info = json.data
        const url = buildLanXiangyuUrl(
          info
            ? {
                lanIps: info.lanIps || [],
                port: info.port ?? 4725,
                mobileHttpsPort: info.mobileHttpsPort ?? 4730,
              }
            : null,
        )
        setHttpsReady(isSecureLanMobileCameraUrl(url || ''))
        setPageUrl(url || '')
        if (url) {
          setQrDataUrl(await QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' }))
        } else {
          setQrDataUrl('')
        }
      } catch {
        if (!cancelled) {
          setPageUrl('')
          setQrDataUrl('')
          setHttpsReady(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const copyUrl = useCallback(async () => {
    if (!pageUrl) return
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('复制此链接到手机浏览器打开：', pageUrl)
    }
  }, [pageUrl])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="打包拍照入口二维码"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="关闭"
        >
          <X size={18} />
        </button>

        <h2 className="pr-8 text-base font-semibold text-slate-900">扫码进入打包拍照</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          手机与电脑连<strong>同一 WiFi</strong>，扫码打开祥钰打包拍照（HTTPS，可调用摄像头）
        </p>
        <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          {SCAN_HINT}
        </p>
        {httpsReady ? (
          <p className="mt-2 text-center text-[10px] leading-relaxed text-emerald-700">
            首次打开点「高级」→「继续访问」信任证书
          </p>
        ) : (
          <p className="mt-2 text-center text-[10px] leading-relaxed text-red-600">
            未检测到内网 HTTPS，请确认电脑已启动且手机与电脑同一 WiFi
          </p>
        )}

        <div className="mt-4 flex flex-col items-center rounded-xl border border-violet-100 bg-violet-50/40 p-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="打包拍照入口二维码" className="w-[220px] rounded-lg border border-white bg-white p-1" />
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg bg-white text-xs text-slate-400">
              {pageUrl === '' && !httpsReady ? '无内网二维码' : '生成中…'}
            </div>
          )}
          {pageUrl && (
            <>
              <button
                type="button"
                onClick={() => void copyUrl()}
                className="mt-3 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-50"
              >
                {copied ? '已复制链接' : '复制链接到浏览器打开'}
              </button>
              <p className="mt-2 w-full break-all text-center text-[10px] leading-tight text-slate-400">{pageUrl}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** 右下角浮动按钮，可再次打开入口二维码 */
export const XiangyuAccessQrFab: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="fixed bottom-5 right-4 z-[70] inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white/95 px-3 py-2 text-xs font-medium text-violet-800 shadow-lg backdrop-blur hover:bg-violet-50"
    title="显示打包拍照入口二维码"
  >
    <QrCode size={16} />
    扫码进入
  </button>
)
