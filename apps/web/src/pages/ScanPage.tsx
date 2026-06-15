import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatedTabs } from '@/components/ui/AnimatedTabs'
import { BraceletDrawer } from '@/components/BraceletDrawer'
import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'
import { inventoryApi } from '@/api/endpoints'
import { useScanWorkbench } from '@/hooks/useScanWorkbench'
import type { Bracelet } from '@/api/types'

type ScanMode = 'outbound' | 'inbound' | 'query'

export const ScanPage: React.FC = () => {
  const [mode, setMode] = useState<ScanMode>('outbound')
  const [buffer, setBuffer] = useState('')
  const [status, setStatus] = useState('')
  const [bracelet, setBracelet] = useState<Bracelet | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
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

  const handleScan = async (certNo: string) => {
    const code = certNo.trim().toUpperCase()
    if (!code) return
    setStatus(`识别：${code}`)
    clearExcelSync()
    try {
      const r = await inventoryApi.getByCert(code)
      const b = r.data
      setBracelet(b)
      setLastCertNo(code)

      if (mode === 'query') {
        setDrawerOpen(true)
        refocus()
        return
      }
      if (mode === 'outbound') {
        if (b.qty === 0) { setStatus(`${code} 已出库`); refocus(); return }
        setPendingOutbound(b)
        return
      }
      if (mode === 'inbound') {
        if (b.qty === 1) {
          setStatus(`${code} 已在库，无需入库`)
          refocus()
          return
        }
        setStatus(`${code} 已售出，跳转退货入库…`)
        navigate(`/inventory/inbound?type=return&certNo=${encodeURIComponent(code)}`)
        return
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (mode === 'inbound' && msg.includes('不存在')) {
        setStatus(`${code} 未在系统中，跳转标签入库…`)
        navigate(`/inventory/inbound?type=register&certNo=${encodeURIComponent(code)}`)
        return
      }
      setStatus(msg)
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
        <p className="text-sm text-slate-500">请将光标保持在此区域，使用扫码枪扫描编号</p>
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
      {pendingOutbound && (
        <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">确认出库 · {pendingOutbound.certNo}</h3>
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
      />
    </div>
  )
}
