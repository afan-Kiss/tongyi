import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  open: boolean
  title: string
  message: string
  variant?: 'error' | 'success' | 'info'
  onClose: () => void
}

const VARIANT_BORDER: Record<NonNullable<Props['variant']>, string> = {
  error: 'border-red-100',
  success: 'border-emerald-100',
  info: 'border-rose-100',
}

const VARIANT_BTN: Record<NonNullable<Props['variant']>, string> = {
  error: 'from-red-500 to-rose-500',
  success: 'from-emerald-500 to-teal-500',
  info: 'from-[#ff2442] to-[#ff6b81]',
}

export const AppMessageDialog: React.FC<Props> = ({
  open,
  title,
  message,
  variant = 'info',
  onClose,
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
        className={`fixed left-1/2 top-1/2 z-[61] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border ${VARIANT_BORDER[variant]} bg-white p-5 shadow-xl`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-message-title"
      >
        <h3 id="app-message-title" className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className={`w-full rounded-full bg-gradient-to-r ${VARIANT_BTN[variant]} py-2.5 text-sm font-semibold text-white`}
          >
            知道了
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
