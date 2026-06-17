import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, X } from 'lucide-react'
import type { Bracelet, BraceletDetail, ExcelSyncResult, MediaAsset } from '@/lib/api'
import { api } from '@/lib/api'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'
import { isPhotoAsset, mediaAssetUrl, mediaThumbUrl } from '@/lib/mediaAsset'
import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'
import { InboundPhotoCapture, type InboundPhotoCaptureHandle } from '@/components/InboundPhotoCapture'
import { LabelPrintPanel } from '@/components/LabelPrintPanel'
import { LabelPrintPreview } from '@/components/LabelPrintPreview'
import { StockOpPanel } from '@/components/StockOpPanel'
import { fillLabelLinesFromBracelet } from '@/lib/labelPrintSync'
import { loadLabelPrintMemory } from '@/lib/labelPrintMemory'
import { formatDateTime } from '@/lib/formatDateTime'

interface Props {
  bracelet: Bracelet | null
  open: boolean
  onClose: () => void
  showLabelPrint?: boolean
  showStockOps?: boolean
  onDeleted?: (certNo: string) => void
  onUpdated?: (b: Bracelet) => void
}

const BASIC_FIELDS = [
  ['arrivalDate', '到货日期'],
  ['batch', '批次'],
  ['category', '品类'],
  ['ringSize', '圈口'],
  ['cost', '成本'],
  ['remark', '备注'],
] as const


export const BraceletDrawer: React.FC<Props> = ({
  bracelet,
  open,
  onClose,
  showLabelPrint,
  showStockOps = true,
  onDeleted,
  onUpdated,
}) => {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [excelSync, setExcelSync] = useState<ExcelSyncResult | null>(null)
  const [partialSuccess, setPartialSuccess] = useState(false)
  const [current, setCurrent] = useState<Bracelet | null>(bracelet)
  const [form, setForm] = useState({
    arrivalDate: '',
    batch: '',
    category: '',
    ringSize: '',
    cost: '',
    remark: '',
  })
  const [detail, setDetail] = useState<Partial<BraceletDetail>>({})
  const photoRef = useRef<InboundPhotoCaptureHandle>(null)

  useEffect(() => {
    if (!open) return
    setEditing(false)
    setDeleteMsg('')
    setSaveMsg('')
    setExcelSync(null)
    setPartialSuccess(false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    setCurrent(bracelet)
    if (!bracelet) return
    setForm({
      arrivalDate: bracelet.arrivalDate || '',
      batch: bracelet.batch || '',
      category: bracelet.category || '',
      ringSize: bracelet.ringSize || '',
      cost: bracelet.cost || '',
      remark: bracelet.remark || '',
    })
    setDetail({ description: bracelet.detail?.description || '' })
  }, [bracelet])

  const labelMemory = useMemo(
    () => (current ? fillLabelLinesFromBracelet(loadLabelPrintMemory(), current) : null),
    [current?.certNo, current?.ringSize, current?.cost, current?.batch, current?.barcodeValue, current?.labelPrice],
  )

  if (!open || !current) return null

  const photos = (current.mediaAssets || []).filter(isPhotoAsset)
  const videos = (current.mediaAssets || []).filter((m) => !isPhotoAsset(m))

  const refreshBracelet = async () => {
    const r = await api.getByCert(current.certNo)
    setCurrent(r.data)
    onUpdated?.(r.data)
    return r.data
  }

  const onDelete = async () => {
    if (deleting) return
    const ok = window.confirm(`确定删除 ${current.certNo}？\n将同时删除数据库记录与本地图片，此操作不可恢复。`)
    if (!ok) return
    setDeleting(true)
    setDeleteMsg('')
    try {
      const deletedCert = current.certNo
      await api.deleteBracelet(deletedCert)
      setCurrent(null)
      onDeleted?.(deletedCert)
      emitInventoryRefresh()
      onClose()
    } catch (e) {
      setDeleteMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  const onSave = async () => {
    setSaving(true)
    setSaveMsg('')
    setExcelSync(null)
    setPartialSuccess(false)
    try {
      if (photoRef.current?.pendingCount()) {
        await photoRef.current.flushPending(current.certNo)
      }
      const r = await api.updateBracelet(current.certNo, {
        ...form,
        detail: detail.description?.trim() ? { description: detail.description } : undefined,
      })
      const updated = r.data.bracelet
      if (updated) {
        setCurrent(updated)
        onUpdated?.(updated)
      }
      if (r.data.partialSuccess) {
        setPartialSuccess(true)
        setExcelSync(r.data.excelSync)
        setSaveMsg('已保存到数据库，Excel 同步失败')
        setEditing(false)
      } else if (r.data.excelSync && !r.data.excelSync.ok) {
        setExcelSync(r.data.excelSync)
        setSaveMsg('已保存到数据库')
        setEditing(false)
      } else {
        setSaveMsg('保存成功')
        setEditing(false)
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const onDeletePhoto = async (asset: MediaAsset) => {
    if (!window.confirm('确定删除这张照片？')) return
    try {
      await api.deleteMedia(asset.id)
      await refreshBracelet()
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return createPortal(
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={`${current.certNo} 详情`}>
        <div className="drawer-panel-inner p-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{current.certNo}</h2>
              {current.barcodeValue && current.barcodeValue !== current.certNo && (
                <p className="text-xs text-slate-500">条形码：{current.barcodeValue}</p>
              )}
              <p className="text-xs text-slate-500">
                {current.qty === 1 ? '在库' : '已出库'} · {current.category || '未分类'}
              </p>
            </div>
            <div className="flex gap-1">
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-rose-50"
                  title="编辑"
                >
                  <Pencil size={16} />
                </button>
              )}
              <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-rose-50">
                <X size={16} />
              </button>
            </div>
          </div>

          {editing ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-rose-50 bg-rose-50/20 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">基础信息（同步 Excel）</h3>
                <div className="grid gap-2">
                  {BASIC_FIELDS.map(([key, label]) => (
                    <label key={key} className="block text-sm">
                      <span className="text-slate-500">{label}</span>
                      <input
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">内部备注（仅存数据库）</h3>
                <label className="block text-sm">
                  <span className="text-slate-500">详细说明</span>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm leading-relaxed"
                    rows={3}
                    value={detail.description || ''}
                    onChange={(e) => setDetail({ description: e.target.value })}
                    placeholder="仅内部查看，不打印、不同步 Excel"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">照片</h3>
                {photos.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {photos.map((p) => (
                      <div key={p.id} className="relative">
                        <img src={mediaThumbUrl(p)} alt="" className="h-28 w-full rounded-xl border border-rose-100 object-cover" />
                        <button
                          type="button"
                          onClick={() => onDeletePhoto(p)}
                          className="absolute right-1 top-1 rounded-full bg-red-500/90 p-1 text-white"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <InboundPhotoCapture
                  ref={photoRef}
                  certNo={current.certNo}
                  deferUpload
                  ackRelayPhotos
                  disabled={saving}
                  onUploaded={() => {
                    void refreshBracelet()
                  }}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setSaveMsg('') }}
                  className="flex-1 rounded-full border border-slate-200 py-2.5 text-sm text-slate-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onSave}
                  className="flex-1 rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存修改'}
                </button>
              </div>
              {saveMsg && <p className="text-center text-xs text-slate-600">{saveMsg}</p>}
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                {([
                  ['批次', current.batch],
                  ['圈口', current.ringSize],
                  ['成本', current.cost],
                  ['到货', current.arrivalDate],
                  ['添加时间', formatDateTime(current.createdAt)],
                  ['售价', current.actualPrice],
                  ['售出', current.soldDate],
                  ['退货', current.returnDate],
                  ['订单', current.orderNo],
                ] as const).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-rose-50/50 px-3 py-2">
                    <p className="text-[10px] text-slate-400">{k}</p>
                    <p className="font-medium text-slate-800">{v || '—'}</p>
                  </div>
                ))}
              </div>

              {current.remark && (
                <p className="mt-3 rounded-xl border border-dashed border-rose-100 bg-white px-3 py-2 text-xs text-slate-600">
                  Excel备注：{current.remark}
                </p>
              )}

              {(photos.length > 0 || videos.length > 0) && (
                <div className="mt-4 space-y-3">
                  {photos.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-800">照片 ({photos.length})</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {photos.map((p) => (
                          <MediaThumb key={p.id} asset={p} />
                        ))}
                      </div>
                    </div>
                  )}
                  {videos.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-800">视频 ({videos.length})</h3>
                      {videos.map((v) => (
                        <video key={v.id} controls className="mb-2 w-full rounded-xl border border-rose-100" src={mediaAssetUrl(v)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {current.detail?.description && (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">内部详细说明</h3>
                  <p className="text-xs leading-relaxed text-slate-600">{current.detail.description}</p>
                </div>
              )}

              {showLabelPrint && labelMemory && (
                <div className="mt-4 space-y-3">
                  <LabelPrintPreview labelMemory={labelMemory} />
                  <LabelPrintPanel bracelet={current} labelMemory={labelMemory} />
                </div>
              )}

              {showStockOps && (
                <div className="mt-4">
                  <StockOpPanel
                    bracelet={current}
                    onUpdated={(b) => {
                      setCurrent(b)
                      onUpdated?.(b)
                    }}
                  />
                </div>
              )}
            </>
          )}

          {(excelSync || partialSuccess) && (
            <ExcelSyncPanel
              result={excelSync}
              partialSuccess={partialSuccess}
              partialMessage="数据库已更新，Excel 同步失败"
              onClose={() => { setExcelSync(null); setPartialSuccess(false) }}
            />
          )}
        </div>

        {!editing && (
          <div className="drawer-footer shrink-0 border-t border-rose-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={16} />
              {deleting ? '删除中…' : '删除此条记录'}
            </button>
            {deleteMsg && <p className="mt-2 text-center text-xs text-red-600">{deleteMsg}</p>}
            <p className="mt-1 text-center text-[10px] text-slate-400">仅删除数据库与本地图片，Excel 行需自行处理</p>
          </div>
        )}
      </aside>
    </>,
    document.body,
  )
}

function MediaThumb({ asset }: { asset: MediaAsset }) {
  return (
    <a
      href={mediaAssetUrl(asset)}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-xl border border-rose-100 bg-slate-100"
    >
      <img
        src={mediaThumbUrl(asset)}
        alt=""
        className="h-36 w-full object-cover"
        loading="lazy"
      />
    </a>
  )
}
