import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Link, useNavigate } from 'react-router-dom'

import { AnimatedTabs } from '@/components/ui/AnimatedTabs'

import { BraceletDrawer } from '@/components/BraceletDrawer'

import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'

import { ScanNotFoundDialog } from '@/components/ScanNotFoundDialog'

import { inventoryApi } from '@/api/endpoints'

import { isPhotoAsset, mediaThumbUrl } from '@/lib/mediaAsset'

import { StockOpPanel } from '@/components/StockOpPanel'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'

import { useScanWorkbench } from '@/hooks/useScanWorkbench'

import type { Bracelet } from '@/api/types'

type ScanMode = 'outbound' | 'inbound' | 'query'

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
  const [mode, setMode] = useState<ScanMode>('outbound')
  const [buffer, setBuffer] = useState('')
  const [status, setStatus] = useState('')
  const [bracelet, setBracelet] = useState<Bracelet | null>(null)
  const [scanMatches, setScanMatches] = useState<Bracelet[]>([])
  const [lastScanned, setLastScanned] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [notFoundScanned, setNotFoundScanned] = useState<string | null>(null)
  const [pendingOutbound, setPendingOutbound] = useState<Bracelet | null>(null)
  const [priceText, setPriceText] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [remarkText, setRemarkText] = useState('小红书发出')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const {
    excelSync, excelLoading, lastCertNo, setLastCertNo,
    partialSuccess, partialMessage,
    doOutbound, refreshSnapshot, retryExcel, clearExcelSync,
  } = useScanWorkbench()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const refocus = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const openFound = useCallback((scanned: string, b: Bracelet, matches?: Bracelet[]) => {
    setBracelet(b)
    setScanMatches(matches && matches.length > 1 ? matches : [])
    setLastCertNo(b.certNo)
    setNotFoundScanned(null)
    setDrawerOpen(true)

    const label = scanStatusLabel(scanned, b)
    const multiHint = matches && matches.length > 1
      ? ` · 共 ${matches.length} 条${matches.every((m) => m.certNo === b.certNo) ? '（编号相同）' : ''}`
      : ''
    if (mode === 'outbound') {
      if (b.qty === 0) {
        setStatus(`${label}${multiHint} · 已出库，可点击下方「确认入库」恢复`)
        setPendingOutbound(null)
      } else {
        setStatus(`${label}${multiHint}`)
        setPendingOutbound(b)
      }
      return
    }
    if (mode === 'inbound') {
      if (b.qty === 1) {
        setStatus(`${label}${multiHint} · 已在库，可点击下方「确认出库」`)
      } else {
        setStatus(`${label}${multiHint} · 已售出，可确认退货入库`)
      }
      setPendingOutbound(null)
      return
    }
    setStatus(`${label}${multiHint}`)
    setPendingOutbound(null)
  }, [mode, setLastCertNo])

  const pickMatch = useCallback((b: Bracelet) => {
    openFound(lastScanned, b, scanMatches.length > 1 ? scanMatches : undefined)
  }, [openFound, lastScanned, scanMatches])

  const handleScan = async (raw: string) => {
    const scanned = normalizeScanInput(raw)
    if (!scanned) return

    setStatus(`识别：${scanned}`)
    setLastScanned(scanned)
    setNotFoundScanned(null)
    setScanMatches([])
    clearExcelSync()

    try {
      const r = await inventoryApi.scanLookup(scanned, {
        includeList: mode === 'query',
      })
      const items = r.data.items
      if (items.length === 1) {
        openFound(scanned, items[0])
      } else {
        setScanMatches(items)
        setBracelet(null)
        setDrawerOpen(false)
        setPendingOutbound(null)
        const sameCert = items.every((m) => m.certNo === items[0].certNo)
        setStatus(
          sameCert
            ? `编号 ${items[0].certNo} 共 ${items.length} 条，请选择查看`
            : `匹配到 ${items.length} 条，请选择`,
        )
      }
      refocus()
    } catch {
      setBracelet(null)
      setScanMatches([])
      setDrawerOpen(false)
      setPendingOutbound(null)
      setNotFoundScanned(scanned)
      setStatus('')
      refocus()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const code = buffer
      setBuffer('')
      handleScan(code)
      return
    }
    if (e.key.length === 1) setBuffer((prev) => prev + e.key)
    else if (e.key === 'Backspace') setBuffer((prev) => prev.slice(0, -1))
  }

  const confirmOutbound = async () => {
    if (!pendingOutbound) return
    try {
      const result = await doOutbound({
        certNo: pendingOutbound.certNo,
        priceText,
        remarkText,
        orderNo,
      })
      setStatus(`${pendingOutbound.certNo} 出库成功${result.partialSuccess ? '（Excel 待同步）' : ''}`)
      setBracelet((await inventoryApi.getByCert(pendingOutbound.certNo)).data)
      setPendingOutbound(null)
      setDrawerOpen(true)
      emitInventoryRefresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
    refocus()
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
          { key: 'outbound', label: '出库' },
          { key: 'inbound', label: '退货入库' },
          { key: 'query', label: '查询' },
        ]}
        activeKey={mode}
        onChange={(k) => { setMode(k as ScanMode); setScanMatches([]); refocus() }}
      />
      <div className="rounded-2xl border border-white/70 bg-white/80 p-6 text-center shadow-sm">
        <p className="text-sm text-slate-500">扫描吊牌条形码或编号，均可识别</p>
        <input
          ref={inputRef}
          className="mt-3 w-full rounded-xl border border-rose-100 bg-rose-50/30 px-4 py-3 text-center text-lg font-semibold tracking-wider text-slate-800 outline-none focus:border-rose-300"
          value={buffer}
          onChange={() => {}}
          onKeyDown={onKeyDown}
          onBlur={refocus}
          placeholder="等待扫码..."
          autoComplete="off"
        />
        {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}
        {scanMatches.length > 1 && (
          <div className="mt-4 space-y-2 text-left">
            <p className="text-xs font-medium text-slate-500">
              {scanMatches.every((m) => m.certNo === scanMatches[0].certNo)
                ? `编号 ${scanMatches[0].certNo} · ${scanMatches.length} 条`
                : `匹配 ${scanMatches.length} 条 · 点击选择`}
            </p>
            {scanMatches.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pickMatch(item)}
                className="flex w-full items-center gap-3 rounded-xl border border-rose-100 bg-white px-3 py-2 text-left shadow-sm hover:bg-rose-50/40"
              >
                {item.mediaAssets?.filter(isPhotoAsset)[0] ? (
                  <img
                    src={mediaThumbUrl(item.mediaAssets.filter(isPhotoAsset)[0])}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-rose-100 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-rose-100 bg-rose-50/50 text-[10px] text-rose-400">
                    无图
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{item.certNo}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.barcodeValue && item.barcodeValue !== item.certNo
                      ? `条形码 ${item.barcodeValue} · `
                      : ''}
                    {item.batch || '—'} · 圈口 {item.ringSize || '—'}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${item.qty === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {item.qty === 1 ? '在库' : '已出'}
                </span>
              </button>
            ))}
          </div>
        )}
        {mode === 'inbound' && (
          <p className="mt-3 text-xs text-slate-500">
            扫已售出编号的吊牌，恢复在库。
            <Link to="/inventory/inbound?type=register" className="ml-1 text-rose-500 underline">
              已有标签？去标签入库登记
            </Link>
          </p>
        )}
      </div>

      {(excelLoading || excelSync || partialSuccess) && (
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

      {mode === 'outbound' && bracelet && bracelet.qty === 0 && (
        <StockOpPanel
          bracelet={bracelet}
          onUpdated={(b) => { setBracelet(b); refocus() }}
        />
      )}

      {mode === 'inbound' && bracelet && bracelet.qty === 0 && (
        <StockOpPanel
          bracelet={bracelet}
          defaultInboundRemark="退货入库"
          hint="该货品已售出，确认要退货入库吗？"
          onUpdated={(b) => { setBracelet(b); refocus() }}
        />
      )}

      {mode === 'inbound' && bracelet && bracelet.qty === 1 && (
        <StockOpPanel
          bracelet={bracelet}
          hint="该货品已在库，是否误操作需要出库？"
          onUpdated={(b) => { setBracelet(b); setPendingOutbound(null); refocus() }}
        />
      )}

      {pendingOutbound && (
        <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">确认出库 · {pendingOutbound.certNo}</h3>
          {pendingOutbound.barcodeValue && pendingOutbound.barcodeValue !== pendingOutbound.certNo && (
            <p className="mt-1 text-xs text-slate-500">条形码：{pendingOutbound.barcodeValue}</p>
          )}
          <div className="mt-3 grid gap-2">
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="实际售价 *" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="订单号" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="备注" value={remarkText} onChange={(e) => setRemarkText(e.target.value)} />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setPendingOutbound(null)} className="flex-1 rounded-full border border-slate-200 py-2 text-sm">取消</button>
            <button type="button" onClick={confirmOutbound} className="flex-1 rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2 text-sm font-semibold text-white">确认出库</button>
          </div>
        </div>
      )}

      <BraceletDrawer
        bracelet={bracelet}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); refocus() }}
        showLabelPrint
        showStockOps={false}
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
        mode={mode}
        onClose={() => { setNotFoundScanned(null); refocus() }}
        onRegister={mode === 'inbound' ? goRegisterInbound : undefined}
      />
    </div>
  )
}
