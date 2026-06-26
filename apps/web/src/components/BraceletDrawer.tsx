import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, X } from 'lucide-react'
import type { Bracelet, BraceletDetail, ExcelSyncResult, MediaAsset } from '@/lib/api'
import { api } from '@/lib/api'
import { operationsApi } from '@/api/endpoints'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'
import { isPhotoAsset, mediaAssetUrl } from '@/lib/mediaAsset'
import { MediaThumbImg } from '@/components/MediaThumbImg'
import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'
import { ExcelSnapshotGallery } from '@/components/ExcelSnapshotGallery'
import { InboundPhotoCapture, type InboundPhotoCaptureHandle } from '@/components/InboundPhotoCapture'
import { LabelPrintPanel } from '@/components/LabelPrintPanel'
import { LabelPrintEditor } from '@/components/LabelPrintEditor'
import { LabelTagPreview } from '@/components/LabelTagPreview'
import { StockOpPanel } from '@/components/StockOpPanel'
import { fillLabelLinesFromBracelet } from '@/lib/labelPrintSync'
import { getBarcodeDigits, loadLabelPrintMemory, type LabelPrintMemory } from '@/lib/labelPrintMemory'
import { formatDateTime } from '@/lib/formatDateTime'
import { useScanWorkbench } from '@/hooks/useScanWorkbench'

function hasExcelSnapshots(sync: ExcelSyncResult | null | undefined): boolean {
  if (!sync) return false
  return !!(sync.beforeSnapshotBase64 || sync.afterSnapshotBase64 || sync.snapshotBase64)
}

interface Props {
  bracelet: Bracelet | null
  open: boolean
  onClose: () => void
  showLabelPrint?: boolean
  showStockOps?: boolean
  /** 扫码「退货入库」：右侧栏按 current.qty 展示重新入库，已在库时不显示出库 */
  inboundReturnMode?: boolean
  /** 传给右侧出入库面板（扫码退货入库等场景） */
  defaultInboundRemark?: string
  showInboundRemark?: boolean
  stockOpHint?: string
  /** 无照片时提示拍照（如从 Excel 刚导入） */
  promptAddPhoto?: boolean
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
  inboundReturnMode = false,
  defaultInboundRemark,
  showInboundRemark,
  stockOpHint,
  promptAddPhoto = false,
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
  const [drawerSnapshots, setDrawerSnapshots] = useState<ExcelSyncResult | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
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
  const [labelMemory, setLabelMemory] = useState<LabelPrintMemory>(() => loadLabelPrintMemory())
  const photoRef = useRef<InboundPhotoCaptureHandle>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const prevOpenRef = useRef(false)
  const orderHoverTimerRef = useRef<number | null>(null)
  const orderHoverCountdownRef = useRef<number | null>(null)
  const [orderLoadReady, setOrderLoadReady] = useState(false)
  const [orderPanelHover, setOrderPanelHover] = useState(false)
  const [orderHoverSecondsLeft, setOrderHoverSecondsLeft] = useState(2)
  const ORDER_LOAD_DELAY_MS = 2000
  const ORDER_LOAD_DELAY_SEC = ORDER_LOAD_DELAY_MS / 1000
  const workbench = useScanWorkbench()
  const { retryExcel, partialMessage: stockPartialMessage } = workbench

  const loadDrawerSnapshots = useCallback(async (certNo: string, refresh = false) => {
    setSnapshotLoading(true)
    try {
      const res = await operationsApi.excelSnapshot(certNo, refresh)
      setDrawerSnapshots((prev) => {
        const incomingHasOp = !!(res.data.beforeSnapshotBase64 || res.data.afterSnapshotBase64)
        const prevHasOp = !!(prev?.beforeSnapshotBase64 || prev?.afterSnapshotBase64)
        if (!incomingHasOp && prevHasOp) return prev
        return res.data
      })
    } catch {
      setDrawerSnapshots(null)
    } finally {
      setSnapshotLoading(false)
    }
  }, [])

  const onExcelSyncChange = useCallback((sync: ExcelSyncResult | null, partial: boolean) => {
    setExcelSync(sync)
    setPartialSuccess(partial)
  }, [])

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setEditing(false)
      setDeleteMsg('')
      setSaveMsg('')
      setExcelSync(null)
      setPartialSuccess(false)
      setDrawerSnapshots(null)
    }
    prevOpenRef.current = open
  }, [open])

  const clearOrderHoverTimer = useCallback(() => {
    if (orderHoverTimerRef.current) {
      window.clearTimeout(orderHoverTimerRef.current)
      orderHoverTimerRef.current = null
    }
    if (orderHoverCountdownRef.current) {
      window.clearInterval(orderHoverCountdownRef.current)
      orderHoverCountdownRef.current = null
    }
  }, [])

  const resetOrderHover = useCallback(() => {
    setOrderPanelHover(false)
    setOrderHoverSecondsLeft(ORDER_LOAD_DELAY_SEC)
    clearOrderHoverTimer()
  }, [clearOrderHoverTimer, ORDER_LOAD_DELAY_SEC])

  useEffect(() => {
    if (!open) {
      setOrderLoadReady(false)
      resetOrderHover()
    }
  }, [open, resetOrderHover])

  useEffect(() => {
    if (inboundReturnMode && current?.qty === 0) {
      setOrderLoadReady(true)
      resetOrderHover()
      return
    }
    setOrderLoadReady(false)
    resetOrderHover()
  }, [current?.certNo, current?.qty, inboundReturnMode, resetOrderHover])

  const onStockPanelMouseEnter = () => {
    if (orderLoadReady) return
    setOrderPanelHover(true)
    setOrderHoverSecondsLeft(ORDER_LOAD_DELAY_SEC)
    clearOrderHoverTimer()
    orderHoverCountdownRef.current = window.setInterval(() => {
      setOrderHoverSecondsLeft((sec) => Math.max(0, sec - 1))
    }, 1000)
    orderHoverTimerRef.current = window.setTimeout(() => {
      setOrderLoadReady(true)
      resetOrderHover()
    }, ORDER_LOAD_DELAY_MS)
  }

  const onStockPanelMouseLeave = () => {
    resetOrderHover()
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open || !current?.certNo) return
    void loadDrawerSnapshots(current.certNo)
  }, [open, current?.certNo, loadDrawerSnapshots])

  useEffect(() => {
    if (!open || !bracelet?.certNo) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.getByCert(bracelet.certNo)
        if (cancelled) return
        setCurrent(r.data)
        setLabelMemory(fillLabelLinesFromBracelet(loadLabelPrintMemory(), r.data))
      } catch {
        /* 保留列表带入的数据 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, bracelet?.certNo])

  useEffect(() => {
    if (!open || !excelSync || !hasExcelSnapshots(excelSync)) return
    setDrawerSnapshots(excelSync)
  }, [open, excelSync])

  useEffect(() => {
    if (!bracelet) {
      setCurrent(null)
      return
    }
    if (!open) {
      setCurrent(bracelet)
    }
    if (editing) return
    setForm({
      arrivalDate: bracelet.arrivalDate || '',
      batch: bracelet.batch || '',
      category: bracelet.category || '',
      ringSize: bracelet.ringSize || '',
      cost: bracelet.cost || '',
      remark: bracelet.remark || '',
    })
    setDetail({ description: bracelet.detail?.description || '' })
    setLabelMemory(fillLabelLinesFromBracelet(loadLabelPrintMemory(), bracelet))
  }, [bracelet, open, editing])

  const displayBarcode = useMemo(() => {
    if (!current) return ''
    const fromLabel = getBarcodeDigits(labelMemory)
    return (fromLabel || current.barcodeValue || '').trim()
  }, [current, labelMemory])

  const dualStockPanel = showStockOps && !editing

  const stockInboundRemark = inboundReturnMode ? (defaultInboundRemark ?? '退货入库') : defaultInboundRemark
  const stockShowInboundRemark = inboundReturnMode ? true : showInboundRemark
  const stockOpHintResolved = inboundReturnMode
    ? `当前${current?.qty === 1 ? '在库' : '已出库'} · 右侧可分别操作入库 / 出库，同步 Excel`
    : stockOpHint

  useEffect(() => {
    if (!dualStockPanel) {
      setOrderLoadReady(false)
      resetOrderHover()
    }
  }, [dualStockPanel, resetOrderHover])

  useEffect(() => {
    if (open && bracelet) {
      setCurrent(bracelet)
    }
  }, [open, bracelet])

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
      await api.updateBracelet(current.certNo, {
        ...form,
        labelPrice: labelMemory.lineFormats.price?.trim() || undefined,
        barcodeValue: getBarcodeDigits(labelMemory) || undefined,
        detail: detail.description?.trim() ? { description: detail.description } : undefined,
      })
      const fresh = await refreshBracelet()
      onUpdated?.(fresh)
      emitInventoryRefresh()
      setSaveMsg('保存成功')
      setEditing(false)
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

  const stockOpPanel = (
    <>
      <StockOpPanel
        bracelet={current}
        embedded
        bothStockActions
        inboundReturnMode={inboundReturnMode}
        defaultInboundRemark={stockInboundRemark}
        showInboundRemark={stockShowInboundRemark}
        hint={stockOpHintResolved}
        orderLoadActive={true}
        orderLoadHovering={orderPanelHover}
        orderLoadSecondsLeft={orderHoverSecondsLeft}
        workbench={workbench}
        embedExcelSync={false}
        onExcelSyncChange={onExcelSyncChange}
        onUpdated={(b) => {
          setCurrent(b)
          onUpdated?.(b)
        }}
      />
      {(excelSync || partialSuccess) && (
        <ExcelSyncPanel
          result={excelSync}
          partialSuccess={partialSuccess}
          partialMessage={stockPartialMessage || '数据库已更新，Excel 同步失败'}
          hideSnapshots
          onRetry={partialSuccess ? retryExcel : undefined}
          onClose={() => {
            setExcelSync(null)
            setPartialSuccess(false)
          }}
        />
      )}
    </>
  )

  return createPortal(
    <div className="detail-modal-root" onClick={onClose}>
      <div
        className={dualStockPanel ? 'detail-modal-dual' : 'detail-modal-single-wrap'}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`detail-modal-panel ${dualStockPanel ? 'detail-modal-panel--detail' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${current.certNo} 详情`}
        >
        <div className="detail-modal-header shrink-0 border-b border-rose-100/80 bg-white/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-wide text-slate-900">{current.certNo}</h2>
              {displayBarcode && displayBarcode !== current.certNo && (
                <p className="truncate text-xs text-slate-500">条形码：{displayBarcode}</p>
              )}
              <p className="text-xs text-slate-500">
                {current.qty === 1 ? '在库' : '已出库'} · {current.category || '未分类'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
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
        </div>
        <div className="detail-modal-panel-inner p-4 pb-2">
          {editing ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-rose-50 bg-rose-50/20 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">基础信息（仅数据库，不改 Excel）</h3>
                <p className="mb-2 text-[11px] text-slate-500">修改 Excel 请通过出库/入库操作；此处只更新系统内记录。</p>
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

              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">吊牌内容</h3>
                <LabelPrintEditor
                  memory={labelMemory}
                  onChange={setLabelMemory}
                  persistToLocalStorage={false}
                  formSync={{
                    certNo: current.certNo,
                    ringSize: form.ringSize,
                    cost: form.cost,
                    batch: form.batch,
                  }}
                />
              </div>

              <div className="rounded-2xl border border-white/70 bg-white/80 p-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">照片</h3>
                {photos.length > 0 && (
                  <div className="mb-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                    {photos.map((p) => (
                      <PhotoThumb key={p.id} asset={p} onDelete={() => onDeletePhoto(p)} />
                    ))}
                  </div>
                )}
                <InboundPhotoCapture
                  ref={photoRef}
                  certNo={current.certNo}
                  deferUpload
                  ackRelayPhotos
                  disabled={saving}
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setSaveMsg('')
                    if (current) {
                      setForm({
                        arrivalDate: current.arrivalDate || '',
                        batch: current.batch || '',
                        category: current.category || '',
                        ringSize: current.ringSize || '',
                        cost: current.cost || '',
                        remark: current.remark || '',
                      })
                      setDetail({ description: current.detail?.description || '' })
                      setLabelMemory(fillLabelLinesFromBracelet(loadLabelPrintMemory(), current))
                    }
                  }}
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
              <div className="grid grid-cols-2 gap-2 text-sm">
                {([
                  ['批次', current.batch],
                  ['圈口', current.ringSize],
                  ['成本', current.cost],
                  ['到货', current.arrivalDate],
                  ['添加时间', formatDateTime(current.createdAt)],
                  ['吊牌售价', current.labelPrice],
                  ['实际售价', current.actualPrice],
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

              {(promptAddPhoto || photos.length > 0) && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-amber-950">
                    {photos.length > 0 ? `照片 (${photos.length})` : '请添加照片'}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                    {photos.length > 0
                      ? '可继续拍照或从相册选图补充。'
                      : '该条目已从 Excel 导入系统，尚未有照片。请用手机扫码连接后拍照留存。'}
                  </p>
                  {photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                      {photos.map((p) => (
                        <PhotoThumb key={p.id} asset={p} />
                      ))}
                    </div>
                  )}
                  <div className="mt-3" data-no-scan-refocus>
                    <InboundPhotoCapture
                      key={current.certNo}
                      certNo={current.certNo}
                      ackRelayPhotos={false}
                      onUploaded={() => void refreshBracelet()}
                    />
                  </div>
                </div>
              )}

              {videos.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-800">视频 ({videos.length})</h3>
                    {videos.map((v) => (
                      <video key={v.id} controls className="mb-2 w-full rounded-xl border border-rose-100" src={mediaAssetUrl(v)} />
                    ))}
                  </div>
                </div>
              )}

              {current.detail?.description && (
                <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">内部详细说明</h3>
                  <p className="text-xs leading-relaxed text-slate-600">{current.detail.description}</p>
                </div>
              )}

              {showLabelPrint && (
                <div className="mt-4 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-800">吊牌打印</h3>
                  <LabelPrintEditor
                    memory={labelMemory}
                    onChange={setLabelMemory}
                    persistToLocalStorage={false}
                    formSync={{
                      certNo: current.certNo,
                      ringSize: current.ringSize || '',
                      cost: current.cost || '',
                      batch: current.batch || '',
                    }}
                  />
                  <div className="rounded-xl border border-rose-100 bg-white p-2">
                    <p className="mb-1.5 text-xs font-semibold text-slate-700">吊牌预览</p>
                    <LabelTagPreview memory={labelMemory} />
                  </div>
                  <LabelPrintPanel bracelet={current} labelMemory={labelMemory} />
                </div>
              )}
            </>
          )}

          <div className="mt-4">
            <ExcelSnapshotGallery
              result={drawerSnapshots}
              loading={snapshotLoading}
              onRefresh={() => void loadDrawerSnapshots(current.certNo, true)}
            />
          </div>

          {!dualStockPanel && (excelSync || partialSuccess) && (
            <ExcelSyncPanel
              result={excelSync}
              partialSuccess={partialSuccess}
              partialMessage={stockPartialMessage || '数据库已更新，Excel 同步失败'}
              hideSnapshots
              onRetry={partialSuccess ? retryExcel : undefined}
              onClose={() => {
                setExcelSync(null)
                setPartialSuccess(false)
              }}
            />
          )}
        </div>

        {!editing && (
          <div className="detail-modal-footer shrink-0 border-t border-rose-100 bg-white/95 px-4 py-3 backdrop-blur-sm">
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
        </div>

        {dualStockPanel && (
          <div
            className={`detail-modal-panel detail-modal-panel--stock transition-colors duration-200 ${
              orderPanelHover && !orderLoadReady
                ? 'bg-emerald-50/90 ring-2 ring-inset ring-emerald-400'
                : ''
            }`}
            role="complementary"
            aria-label={`${current.certNo} 出入库`}
            onMouseEnter={onStockPanelMouseEnter}
            onMouseLeave={onStockPanelMouseLeave}
          >
            <div className="shrink-0 border-b border-rose-100/80 bg-gradient-to-r from-rose-50/80 to-white px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">出入库操作</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {current.certNo} · {current.qty === 1 ? '在库' : '已出库'}
              </p>
            </div>
            <div className="detail-modal-panel--stock-inner p-4 pb-5" data-no-scan-refocus>{stockOpPanel}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function PhotoThumb({ asset, onDelete }: { asset: MediaAsset; onDelete?: () => void }) {
  return (
    <div className="relative aspect-square min-w-0">
      <a
        href={mediaAssetUrl(asset)}
        target="_blank"
        rel="noreferrer"
        title="点击查看原图"
        className="block h-full w-full overflow-hidden rounded-lg border border-rose-100 bg-slate-100"
      >
        <MediaThumbImg
          asset={asset}
          className="h-full w-full object-cover"
          placeholderClassName="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] text-slate-400"
          loading="lazy"
        />
      </a>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            onDelete()
          }}
          className="absolute right-0.5 top-0.5 rounded-full bg-red-500/90 p-0.5 text-white"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}
