import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  scanned: string
  mode: 'outbound' | 'inbound' | 'query'
  onClose: () => void
  onRegister?: () => void
}

export const ScanNotFoundDialog: React.FC<Props> = ({
  open,
  scanned,
  mode,
  onClose,
  onRegister,
}) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-[61] w-[min(92vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-rose-100 bg-white p-5 shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="scan-not-found-title"
      >
        <h3 id="scan-not-found-title" className="text-lg font-semibold text-slate-900">未找到记录</h3>
        <p className="mt-2 text-sm text-slate-600">
          扫码内容「<span className="font-mono font-medium text-slate-800">{scanned}</span>」在库存中不存在。
        </p>
        <p className="mt-1 text-xs text-slate-500">
          请确认吊牌条形码已打印入库，或尝试扫描编号。
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-slate-200 py-2.5 text-sm text-slate-700"
          >
            关闭
          </button>
          {mode === 'inbound' && onRegister && (
            <button
              type="button"
              onClick={onRegister}
              className="flex-1 rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white"
            >
              去标签入库
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  )
}
