import React, { useCallback, useEffect, useRef, useState } from 'react'

import { Link, useNavigate } from 'react-router-dom'

import { AnimatedTabs } from '@/components/ui/AnimatedTabs'

import { BraceletDrawer } from '@/components/BraceletDrawer'

import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'

import { ScanNotFoundDialog } from '@/components/ScanNotFoundDialog'

import { inventoryApi } from '@/api/endpoints'

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

  const openFound = useCallback((scanned: string, b: Bracelet) => {
    setBracelet(b)
    setLastCertNo(b.certNo)
    setNotFoundScanned(null)
    setDrawerOpen(true)

    const label = scanStatusLabel(scanned, b)
    if (mode === 'outbound') {
      if (b.qty === 0) {
        setStatus(`${label} · 已出库，无法再次出库`)
        setPendingOutbound(null)
      } else {
        setStatus(label)
        setPendingOutbound(b)
      }
      return
    }
    if (mode === 'inbound') {
      if (b.qty === 1) {
        setStatus(`${label} · 已在库，无需退货入库`)
      } else {
        setStatus(`${label} · 已售出，可确认退货入库`)
      }
      setPendingOutbound(null)
      return
    }
    setStatus(label)
    setPendingOutbound(null)
  }, [mode, setLastCertNo])

  const handleScan = async (raw: string) => {
    const scanned = normalizeScanInput(raw)
    if (!scanned) return

    setStatus(`识别：${scanned}`)
    setNotFoundScanned(null)
    clearExcelSync()

    try {
      const r = await inventoryApi.getByCert(scanned)
      openFound(scanned, r.data)
      refocus()
    } catch {
      setBracelet(null)
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
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
    refocus()
  }

  const goReturnInbound = () => {
    if (!bracelet) return
    navigate(`/inventory/inbound?type=return&certNo=${encodeURIComponent(bracelet.certNo)}`)
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
        onChange={(k) => { setMode(k as ScanMode); refocus() }}
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

      {mode === 'inbound' && bracelet && bracelet.qty === 0 && drawerOpen && (
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
          <p className="text-sm text-slate-700">该货品已售出，确认要退货入库吗？</p>
          <button
            type="button"
            onClick={goReturnInbound}
            className="mt-3 w-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-semibold text-white"
          >
            去退货入库 · {bracelet.certNo}
          </button>
        </div>
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
