import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AnimatedTabs } from '@/components/ui/AnimatedTabs'

import { BraceletDrawer } from '@/components/BraceletDrawer'

import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'

import { ScanNotFoundDialog } from '@/components/ScanNotFoundDialog'

import { inventoryApi } from '@/api/endpoints'

import { isPhotoAsset } from '@/lib/mediaAsset'
import { MediaThumbImg } from '@/components/MediaThumbImg'

import { ReturnOrderSearchPanel } from '@/components/ReturnOrderSearchPanel'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'
import { scheduleScanRefocus } from '@/lib/scanFocus'
import { useScanWorkbench } from '@/hooks/useScanWorkbench'

import type { Bracelet } from '@/api/types'

type ScanMode = 'query' | 'returnLookup'

function parseScanMode(raw: string | null): ScanMode {
  if (raw === 'returnLookup') return 'returnLookup'
  // 兼容旧链接 mode=outbound / mode=inbound
  return 'query'
}

function normalizeScanInput(raw: string): string {
  return raw.replace(/[\r\n\0]+/g, '').trim()
}

function scanStatusLabel(scanned: string, b: Bracelet): string {
  const code = scanned.trim()
  const barcode = b.barcodeValue?.trim()
  if (barcode && code === barcode && code !== b.certNo) {
    return `条形码 ${code} → 编号 ${b.certNo}`
  }
  if (barcode && barcode !== b.certNo && code.toUpperCase() === b.certNo.toUpperCase()) {
    return `编号 ${b.certNo}（条形码 ${barcode}）`
  }
  return `识别：${b.certNo}`
}

export const ScanPage: React.FC = () => {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<ScanMode>(() => parseScanMode(params.get('mode')))
  const [status, setStatus] = useState('')
  const [bracelet, setBracelet] = useState<Bracelet | null>(null)
  const [scanMatches, setScanMatches] = useState<Bracelet[]>([])
  const [lastScanned, setLastScanned] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notFoundScanned, setNotFoundScanned] = useState<string | null>(null)
  const [promptAddPhoto, setPromptAddPhoto] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scanGenRef = useRef(0)
  const navigate = useNavigate()

  const {
    excelSync, excelLoading, lastCertNo, setLastCertNo,
    partialSuccess, partialMessage,
    refreshSnapshot, retryExcel, clearExcelSync,
  } = useScanWorkbench()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const refocus = useCallback(() => {
    scheduleScanRefocus(inputRef)
  }, [])

  const clearScanInput = useCallback(() => {
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  useEffect(() => {
    if (mode === 'returnLookup') return
    clearScanInput()
    inputRef.current?.focus()
  }, [mode, clearScanInput])

  const onScanBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const next = e.relatedTarget as HTMLElement | null
      if (next?.closest('[data-no-scan-refocus]')) return
      if (next?.closest('[data-scan-panel]')) return
      window.setTimeout(() => {
        if (window.getSelection()?.toString()) return
        refocus()
      }, 120)
    },
    [refocus],
  )

  const openFound = useCallback((
    scanned: string,
    b: Bracelet,
    matches?: Bracelet[],
    opts?: { importedFromExcel?: boolean; needsPhoto?: boolean; excelSource?: 'cache' | 'live' | null },
  ) => {
    setBracelet(b)
    setScanMatches(matches && matches.length > 1 ? matches : [])
    setLastCertNo(b.certNo)
    setNotFoundScanned(null)
    setPromptAddPhoto(!!opts?.needsPhoto)
    setDrawerOpen(true)

    const label = scanStatusLabel(scanned, b)
    const multiHint = matches && matches.length > 1
      ? ` · 共 ${matches.length} 条${matches.every((m) => m.certNo === b.certNo) ? '（编号相同）' : ''}`
      : ''
    const importHint = opts?.importedFromExcel
      ? ` · 已从 Excel${opts.excelSource === 'cache' ? '缓存' : ''}导入系统`
      : ''
    const photoHint = opts?.needsPhoto ? ' · 请添加照片' : ''
    setStatus(
      `${label}${multiHint}${importHint} · ${b.qty === 1 ? '在库' : '已出库'}，请在右侧操作入库或出库${photoHint}`,
    )
  }, [setLastCertNo])

  const pickMatch = useCallback((b: Bracelet) => {
    openFound(lastScanned, b, scanMatches.length > 1 ? scanMatches : undefined)
    refocus()
  }, [openFound, lastScanned, scanMatches, refocus])

  const handleScan = async (raw: string) => {
    const scanned = normalizeScanInput(raw)
    if (!scanned) return

    const gen = ++scanGenRef.current

    setStatus(`识别：${scanned}`)
    setLastScanned(scanned)
    setNotFoundScanned(null)
    setScanMatches([])
    setPromptAddPhoto(false)
    clearExcelSync()

    try {
      const r = await inventoryApi.scanLookup(scanned, { includeList: true, importFromExcel: true })
      if (gen !== scanGenRef.current) return
      const { items, importedFromExcel, needsPhoto, excelSource } = r.data
      if (items.length === 1) {
        openFound(scanned, items[0], undefined, {
          importedFromExcel,
          needsPhoto,
          excelSource,
        })
      } else {
        setScanMatches(items)
          setBracelet(null)
          setDrawerOpen(false)
          setPromptAddPhoto(false)
          const sameCert = items.every((m) => m.certNo === items[0].certNo)
        setStatus(
          sameCert
            ? `编号 ${items[0].certNo} 共 ${items.length} 条，请选择查看`
            : `匹配到 ${items.length} 条，请选择`,
        )
      }
      refocus()
    } catch {
      if (gen !== scanGenRef.current) return
      setBracelet(null)
      setScanMatches([])
      setDrawerOpen(false)
      setPromptAddPhoto(false)
      setNotFoundScanned(scanned)
      setStatus('')
      refocus()
    }
  }

  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = normalizeScanInput(e.currentTarget.value)
    e.currentTarget.value = ''
    if (!code) return
    void handleScan(code)
  }

  const goRegisterInbound = () => {
    const code = notFoundScanned || ''
    setNotFoundScanned(null)
    navigate(`/inventory/inbound?type=register&certNo=${encodeURIComponent(code)}`)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">扫码工作台</h2>
      <AnimatedTabs
        items={[
          { key: 'query', label: '查询' },
          { key: 'returnLookup', label: '查退货' },
        ]}
        activeKey={mode}
        onChange={(k) => {
          scanGenRef.current += 1
          setMode(k as ScanMode)
          setScanMatches([])
          setBracelet(null)
          setDrawerOpen(false)
          setStatus('')
          refocus()
        }}
      />
      {mode === 'returnLookup' ? (
        <ReturnOrderSearchPanel />
      ) : (
      <div className="rounded-2xl border border-white/70 bg-white/80 p-6 text-center shadow-sm" data-scan-panel>
        <p className="text-sm text-slate-500">扫描吊牌条形码或编号，先查系统库存，无记录则查 Excel 缓存并自动登记</p>
        <input
          ref={inputRef}
          className="mt-3 w-full rounded-xl border border-rose-100 bg-rose-50/30 px-4 py-3 text-center text-lg font-semibold tracking-wider text-slate-800 outline-none focus:border-rose-300"
          type="text"
          onKeyDown={onScanKeyDown}
          onBlur={onScanBlur}
          placeholder="输入编号或扫码查询…"
          autoComplete="off"
          spellCheck={false}
        />
        {status && (
          <div
            tabIndex={-1}
            data-no-scan-refocus
            role="status"
            className="mt-3 cursor-text select-text text-sm text-slate-600 outline-none"
          >
            {status}
          </div>
        )}
        {scanMatches.length > 1 && (
          <div className="mt-4 space-y-2 text-left">
            <p className="text-xs font-medium text-slate-500">
              {scanMatches.every((m) => m.certNo === scanMatches[0].certNo)
                ? `编号 ${scanMatches[0].certNo} · ${scanMatches.length} 条`
                : `匹配 ${scanMatches.length} 条 · 点击选择`}
            </p>
            {scanMatches.map((item) => {
              const selected = bracelet?.id === item.id
              return (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected}
                onClick={() => pickMatch(item)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition ${
                  selected
                    ? 'border-slate-800 bg-slate-800 text-white ring-2 ring-slate-900/20 shadow-md'
                    : 'border-rose-100 bg-white hover:border-rose-200 hover:bg-rose-50/40'
                }`}
              >
                {item.mediaAssets?.filter(isPhotoAsset)[0] ? (
                  <MediaThumbImg
                    asset={item.mediaAssets.filter(isPhotoAsset)[0]}
                    className={`h-12 w-12 shrink-0 rounded-lg border object-cover ${
                      selected ? 'border-white/30' : 'border-rose-100'
                    }`}
                    placeholderClassName={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed text-[10px] ${
                      selected ? 'border-white/30 text-white/60' : 'border-rose-100 text-slate-400'
                    }`}
                  />
                ) : (
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed text-[10px] ${
                      selected
                        ? 'border-white/40 bg-white/10 text-white/80'
                        : 'border-rose-100 bg-rose-50/50 text-rose-400'
                    }`}
                  >
                    无图
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${selected ? 'text-white' : 'text-slate-900'}`}>
                    {item.certNo}
                  </p>
                  <p className={`truncate text-xs ${selected ? 'text-white/80' : 'text-slate-500'}`}>
                    {item.barcodeValue && item.barcodeValue !== item.certNo
                      ? `条形码 ${item.barcodeValue} · `
                      : ''}
                    {item.batch || '—'} · 圈口 {item.ringSize || '—'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {selected && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-900">
                      当前选中
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      selected
                        ? item.qty === 1
                          ? 'bg-emerald-400 text-emerald-950'
                          : 'bg-white/20 text-white'
                        : item.qty === 1
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {item.qty === 1 ? '在库' : '已出'}
                  </span>
                </div>
              </button>
            )})}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          扫不到记录？
          <Link to="/inventory/inbound?type=register" className="ml-1 text-rose-500 underline">
            去标签入库登记
          </Link>
        </p>
      </div>
      )}

      {mode === 'query' && (excelLoading || excelSync || partialSuccess) && (
        <ExcelSyncPanel
          result={excelSync}
          loading={excelLoading}
          partialSuccess={partialSuccess}
          partialMessage={partialMessage}
          onRefresh={lastCertNo ? () => refreshSnapshot(lastCertNo) : undefined}
          onRetry={partialSuccess ? retryExcel : undefined}
          onClose={clearExcelSync}
        />
      )}

      {mode === 'query' && (
      <>
      <BraceletDrawer
        bracelet={bracelet}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); refocus() }}
        showLabelPrint
        showStockOps
        inboundReturnMode
        defaultInboundRemark="退货入库"
        promptAddPhoto={promptAddPhoto}
        onUpdated={(b) => {
          setBracelet(b)
          const hasPhoto = (b.mediaAssets || []).some(isPhotoAsset)
          if (hasPhoto) setPromptAddPhoto(false)
        }}
        onDeleted={(certNo) => {
          setBracelet(null)
          setDrawerOpen(false)
          if (bracelet?.certNo === certNo) setStatus(`已删除 ${certNo}`)
          emitInventoryRefresh()
          refocus()
        }}
      />

      <ScanNotFoundDialog
        open={notFoundScanned !== null}
        scanned={notFoundScanned || ''}
        onClose={() => { setNotFoundScanned(null); refocus() }}
        onRegister={goRegisterInbound}
      />
      </>
      )}
    </div>
  )
}

