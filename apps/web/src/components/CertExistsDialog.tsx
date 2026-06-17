import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Bracelet } from '@/api/types'

interface Props {
  open: boolean
  certNo: string
  bracelet?: Bracelet | null
  onClose: () => void
}

export const CertExistsDialog: React.FC<Props> = ({
  open,
  certNo,
  bracelet,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const stockLabel = bracelet ? (bracelet.qty === 1 ? '在库' : '已出库') : null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-[61] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-amber-100 bg-white p-5 shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cert-exists-title"
      >
        <h3 id="cert-exists-title" className="text-lg font-semibold text-slate-900">编号已存在</h3>
        <p className="mt-2 text-sm text-slate-600">
          编号「<span className="font-mono font-medium text-slate-800">{certNo}</span>」已在系统中，
          不能重复标签入库。
        </p>
        {stockLabel && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            当前状态：{stockLabel}
            {bracelet?.category ? ` · ${bracelet.category}` : ''}
            {bracelet?.ringSize ? ` · 圈口 ${bracelet.ringSize}` : ''}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          请核对手写编号是否填错，或到「扫码工作台 → 查询」查看该条目。
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white"
          >
            我知道了
          </button>
        </div>
      </div>
    </>,
    document.body,
  )
}
