import React, { useCallback, useEffect, useState } from 'react'

import { CheckCircle2, XCircle, RefreshCw, AlertTriangle, X, ExternalLink } from 'lucide-react'

import type { ExcelSyncResult } from '@/lib/api'

interface Props {
  result: ExcelSyncResult | null
  loading?: boolean
  partialSuccess?: boolean
  partialMessage?: string
  onRefresh?: () => void
  onRetry?: () => void
  onClose?: () => void
}

function snapshotDataUrl(b64?: string): string | null {
  if (!b64?.trim()) return null
  const s = b64.trim()
  if (s.startsWith('data:')) return s
  return `data:image/png;base64,${s}`
}

function formatSyncedAt(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function SnapshotThumb({
  label,
  b64,
  onOpen,
}: {
  label: string
  b64?: string
  onOpen: (url: string, title: string) => void
}) {
  const url = snapshotDataUrl(b64)
  if (!url) return null

  return (
    <button
      type="button"
      onClick={() => onOpen(url, label)}
      className="group flex flex-col overflow-hidden rounded-xl border border-rose-100 bg-white text-left transition hover:border-rose-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-rose-300"
    >
      <div className="relative">
        <img src={url} alt={label} className="max-h-36 w-full object-contain bg-slate-50" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-medium text-white opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
          点击查看大图
        </span>
      </div>
      <p className="border-t border-rose-50 px-2 py-1.5 text-center text-[11px] font-medium text-slate-600">
        {label}
      </p>
    </button>
  )
}

export const ExcelSyncPanel: React.FC<Props> = ({
  result,
  loading,
  partialSuccess,
  partialMessage,
  onRefresh,
  onRetry,
  onClose,
}) => {
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null)

  const openPreview = useCallback((url: string, title: string) => {
    setPreview({ url, title })
  }, [])

  const closePreview = useCallback(() => setPreview(null), [])

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, closePreview])

  if (!result && !loading && !partialSuccess) return null

  const showPartial = partialSuccess && result && !result.ok
  const afterB64 = result?.afterSnapshotBase64 ?? result?.snapshotBase64
  const beforeB64 = result?.beforeSnapshotBase64
  const hasAnySnapshot = !!(beforeB64 || afterB64)
  const syncedAtLabel = formatSyncedAt(result?.syncedAt)

  return (
    <>
      <div
        className={`rounded-2xl border p-4 shadow-lg ${
          showPartial ? 'border-amber-200 bg-amber-50/90' : 'border-white/70 bg-white/90'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {loading ? (
              <RefreshCw size={18} className="animate-spin text-rose-500" />
            ) : showPartial ? (
              <AlertTriangle size={18} className="text-amber-600" />
            ) : result?.ok ? (
              <CheckCircle2 size={18} className="text-emerald-500" />
            ) : (
              <XCircle size={18} className="text-red-500" />
            )}
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {loading
                  ? '正在同步 Excel 并生成截图...'
                  : showPartial
                    ? '数据库已更新 · Excel 待同步'
                    : 'Excel 同步结果'}
              </h3>
              {showPartial && partialMessage && (
                <p className="text-xs font-medium text-amber-700">{partialMessage}</p>
              )}
              {result && (
                <p
                  className={`text-xs ${result.ok ? 'text-emerald-600' : showPartial ? 'text-amber-600' : 'text-red-600'}`}
                >
                  {result.message}
                </p>
              )}
              {result?.row && (
                <p className="text-[11px] text-slate-400">
                  {result.sheet} · 第 {result.row} 行
                </p>
              )}
              {syncedAtLabel && (
                <p className="text-[11px] text-slate-500">操作时间：{syncedAtLabel}</p>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {onRetry && showPartial && (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                重试 Excel 同步
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600 hover:bg-rose-50"
              >
                重新截图
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600"
              >
                关闭
              </button>
            )}
          </div>
        </div>

        {hasAnySnapshot && (
          <div className="mt-3">
            <p className="mb-2 text-[11px] text-slate-500">
              点击缩略图可查看大图，核对 Excel 改前/改后是否一致
            </p>
            <div
              className={`grid gap-2 ${beforeB64 && afterB64 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}
            >
              <SnapshotThumb label="改前截图" b64={beforeB64} onOpen={openPreview} />
              <SnapshotThumb label="改后截图" b64={afterB64} onOpen={openPreview} />
            </div>
          </div>
        )}

        {result?.verify && Object.keys(result.verify).length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {Object.entries(result.verify).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-rose-50/50 px-2 py-1.5">
                <p className="text-[10px] text-slate-400">{k}</p>
                <p className="truncate text-xs font-medium text-slate-800">{v || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={preview.title}
          onClick={closePreview}
        >
          <div
            className="relative flex max-h-[92vh] max-w-[96vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{preview.title}</p>
                {syncedAtLabel && (
                  <p className="text-[11px] text-slate-500">操作时间：{syncedAtLabel}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  <ExternalLink size={12} />
                  新窗口打开
                </a>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="关闭"
                >
                  <X size={18} />
                </button>
               </div>
            </div>
            <div className="overflow-auto bg-slate-100 p-2">
              <img
                src={preview.url}
                alt={preview.title}
                className="mx-auto max-h-[calc(92vh-4rem)] w-auto max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
