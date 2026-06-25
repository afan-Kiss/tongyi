import React, { useCallback, useEffect, useState } from 'react'
import { ExternalLink, RefreshCw, X } from 'lucide-react'

import type { ExcelSyncResult } from '@/lib/api'

export function snapshotDataUrl(b64?: string): string | null {
  if (!b64?.trim()) return null
  const s = b64.trim()
  if (s.startsWith('data:')) return s
  return `data:image/png;base64,${s}`
}

function dataUrlToBlobUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('invalid data url')
  const header = dataUrl.slice(0, comma)
  const b64 = dataUrl.slice(comma + 1)
  const mime = header.match(/data:([^;]+)/i)?.[1] || 'image/png'
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

function extractBase64FromDataUrl(dataUrl: string): { b64: string; mime: string } {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('invalid data url')
  const header = dataUrl.slice(0, comma)
  const mime = header.match(/data:([^;]+)/i)?.[1] || 'image/png'
  return { b64: dataUrl.slice(comma + 1), mime }
}

/** 新窗口查看截图（在新窗口内创建 blob，避免 noopener 跨窗口 blob 失效） */
export function openSnapshotInNewWindow(dataUrl: string, title = 'Excel 截图'): boolean {
  const url = snapshotDataUrl(dataUrl) || dataUrl
  if (!url?.startsWith('data:')) return false

  try {
    const { b64, mime } = extractBase64FromDataUrl(url)
    const safeTitle = title.replace(/[<>&"'`]/g, '')

    const w = window.open('about:blank', '_blank')
    if (!w) {
      const blobUrl = dataUrlToBlobUrl(url)
      const opened = window.open(blobUrl, '_blank')
      if (!opened) {
        URL.revokeObjectURL(blobUrl)
        return false
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000)
      return true
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #111; }
  body { display: flex; justify-content: center; align-items: flex-start; padding: 12px; box-sizing: border-box; }
  img { max-width: 100%; height: auto; background: #fff; display: block; }
  .err { color: #fca5a5; font: 14px/1.5 system-ui, sans-serif; padding: 24px; }
</style>
</head>
<body>
<script>
(function () {
  try { window.opener = null; } catch (e) {}
  var b64 = ${JSON.stringify(b64)};
  var mime = ${JSON.stringify(mime)};
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  var blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  var img = document.createElement('img');
  img.alt = ${JSON.stringify(safeTitle)};
  img.src = blobUrl;
  img.onload = function () { URL.revokeObjectURL(blobUrl); };
  img.onerror = function () {
    document.body.innerHTML = '<p class="err">截图加载失败，请关闭后重试。</p>';
    URL.revokeObjectURL(blobUrl);
  };
  document.body.appendChild(img);
})();
<\/script>
</body>
</html>`

    w.document.open()
    w.document.write(html)
    w.document.close()
    return true
  } catch {
    return false
  }
}

export function formatSyncedAt(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function SnapshotThumb({
  label,
  b64,
  onOpen,
  syncedAt,
}: {
  label: string
  b64?: string
  onOpen: (url: string, title: string, syncedAt?: string) => void
  syncedAt?: string
}) {
  const url = snapshotDataUrl(b64)
  if (!url) return null

  return (
    <button
      type="button"
      onClick={() => onOpen(url, label, syncedAt)}
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

interface GalleryProps {
  result: ExcelSyncResult | null
  loading?: boolean
  title?: string
  emptyHint?: string
  onRefresh?: () => void
  className?: string
}

/** 无出入库：Excel 现状（本地缓存）；有出入库：改前 + 改后留底 */
export const ExcelSnapshotGallery: React.FC<GalleryProps> = ({
  result,
  loading,
  title = 'Excel 截图',
  emptyHint = '暂无截图（请确认 Excel 已打开；出入库同步后会保留改前/改后）',
  onRefresh,
  className = '',
}) => {
  const [preview, setPreview] = useState<{ url: string; title: string; syncedAt?: string } | null>(null)

  const openPreview = useCallback((url: string, t: string, syncedAt?: string) => {
    setPreview({ url, title: t, syncedAt })
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

  const currentB64 = result?.currentSnapshotBase64
  const afterB64 = result?.afterSnapshotBase64 ?? result?.snapshotBase64
  const beforeB64 = result?.beforeSnapshotBase64
  const hasOpSnapshots = !!(beforeB64 || afterB64)
  const hasCurrent = !hasOpSnapshots && !!currentB64
  const hasAnySnapshot = hasOpSnapshots || hasCurrent
  const opSyncedAtLabel = formatSyncedAt(result?.syncedAt)
  const currentSyncedAtLabel = formatSyncedAt(result?.currentSyncedAt)
  const thumbCount = hasOpSnapshots
    ? [beforeB64, afterB64].filter(Boolean).length
    : currentB64
      ? 1
      : 0
  const gridClass =
    thumbCount >= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'

  return (
    <>
      <div className={`rounded-2xl border border-rose-100 bg-rose-50/20 p-3 ${className}`}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            {result?.row && (
              <p className="text-[11px] text-slate-400">
                {result.sheet} · 第 {result.row} 行
              </p>
            )}
            {hasCurrent && currentSyncedAtLabel && (
              <p className="text-[11px] text-slate-500">
                现状截图：{currentSyncedAtLabel}
                {result?.currentFromCache ? '（本地缓存）' : ''}
              </p>
            )}
            {opSyncedAtLabel && hasOpSnapshots && (
              <p className="text-[11px] text-slate-500">出入库同步：{opSyncedAtLabel}</p>
            )}
            {result?.message && !loading && (
              <p className="text-[11px] text-slate-500">{result.message}</p>
            )}
          </div>
          {onRefresh && !hasOpSnapshots && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              重新截取
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
            <RefreshCw size={14} className="animate-spin text-rose-500" />
            正在加载 Excel 截图…
          </div>
        ) : hasAnySnapshot ? (
          <>
            <p className="mb-2 text-[11px] text-slate-500">
              {hasOpSnapshots
                ? '出入库改前/改后截图已留底，点击缩略图可查看大图'
                : result?.currentFromCache
                  ? '已载入本地缓存，无需等待实时截取；点「重新截取」可更新现状'
                  : '点击缩略图可查看大图'}
            </p>
            <div className={`grid gap-2 ${gridClass}`}>
              {hasOpSnapshots ? (
                <>
                  <SnapshotThumb
                    label="改前截图"
                    b64={beforeB64}
                    syncedAt={result?.syncedAt}
                    onOpen={openPreview}
                  />
                  <SnapshotThumb
                    label="改后截图"
                    b64={afterB64}
                    syncedAt={result?.syncedAt}
                    onOpen={openPreview}
                  />
                </>
              ) : (
                <SnapshotThumb
                  label="Excel 现状"
                  b64={currentB64}
                  syncedAt={result?.currentSyncedAt}
                  onOpen={openPreview}
                />
              )}
            </div>
            {hasCurrent && result?.currentSnapshotError && (
              <p className="mt-2 text-center text-[11px] text-amber-700">
                实时截取失败，已显示缓存：{result.currentSnapshotError}
              </p>
            )}
          </>
        ) : (
          <p className="py-4 text-center text-xs text-slate-400">{emptyHint}</p>
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
                {preview.syncedAt && (
                  <p className="text-[11px] text-slate-500">截图时间：{formatSyncedAt(preview.syncedAt)}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!openSnapshotInNewWindow(preview.url, preview.title)) {
                      window.alert('无法在新窗口打开截图，请使用下方大图查看')
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  <ExternalLink size={12} />
                  新窗口打开
                </button>
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
