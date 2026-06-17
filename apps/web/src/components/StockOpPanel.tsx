import React, { useState } from 'react'
import type { Bracelet } from '@/api/types'
import { inventoryApi } from '@/api/endpoints'
import { useScanWorkbench } from '@/hooks/useScanWorkbench'
import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'

interface Props {
  bracelet: Bracelet
  onUpdated?: (b: Bracelet) => void
  /** 入库默认备注 */
  defaultInboundRemark?: string
  /** 出库默认备注 */
  defaultOutboundRemark?: string
  /** 面板标题前缀，如「误操作」 */
  hint?: string
}

export const StockOpPanel: React.FC<Props> = ({
  bracelet,
  onUpdated,
  defaultInboundRemark = '误出库恢复',
  defaultOutboundRemark = '小红书发出',
  hint,
}) => {
  const [inboundRemark, setInboundRemark] = useState(defaultInboundRemark)
  const [priceText, setPriceText] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [remarkText, setRemarkText] = useState(defaultOutboundRemark)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const {
    excelSync, excelLoading, partialSuccess, partialMessage,
    doInbound, doOutbound, retryExcel, clearExcelSync,
  } = useScanWorkbench()

  const refresh = async () => {
    const r = await inventoryApi.getByCert(bracelet.certNo)
    onUpdated?.(r.data)
    return r.data
  }

  const confirmInbound = async () => {
    setBusy(true)
    setStatus('')
    clearExcelSync()
    try {
      const result = await doInbound(bracelet.certNo, inboundRemark)
      setStatus(`${bracelet.certNo} 入库成功${result.partialSuccess ? '（Excel 待同步）' : ''}`)
      await refresh()
      emitInventoryRefresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmOutbound = async () => {
    setBusy(true)
    setStatus('')
    clearExcelSync()
    try {
      const result = await doOutbound({
        certNo: bracelet.certNo,
        priceText,
        remarkText,
        orderNo,
      })
      setStatus(`${bracelet.certNo} 出库成功${result.partialSuccess ? '（Excel 待同步）' : ''}`)
      await refresh()
      emitInventoryRefresh()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const isOut = bracelet.qty === 0

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${isOut ? 'border-emerald-100 bg-emerald-50/40' : 'border-rose-100 bg-rose-50/30'}`}>
      <p className="text-sm text-slate-700">
        {hint || (isOut ? '该货品已出库，是否误操作需要重新入库？' : '该货品在库，是否误操作需要出库？')}
      </p>

      {isOut ? (
        <input
          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          placeholder="入库备注"
          value={inboundRemark}
          disabled={busy}
          onChange={(e) => setInboundRemark(e.target.value)}
        />
      ) : (
        <div className="mt-3 grid gap-2">
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="实际售价 *"
            value={priceText}
            disabled={busy}
            onChange={(e) => setPriceText(e.target.value)}
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="订单号"
            value={orderNo}
            disabled={busy}
            onChange={(e) => setOrderNo(e.target.value)}
          />
          <input
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="备注"
            value={remarkText}
            disabled={busy}
            onChange={(e) => setRemarkText(e.target.value)}
          />
        </div>
      )}

      <button
        type="button"
        disabled={busy || (!isOut && !priceText.trim())}
        onClick={isOut ? confirmInbound : confirmOutbound}
        className={`mt-3 w-full rounded-full py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
          isOut
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
            : 'bg-gradient-to-r from-[#ff2442] to-[#ff6b81]'
        }`}
      >
        {busy ? '处理中…' : isOut ? `确认入库 · ${bracelet.certNo}` : `确认出库 · ${bracelet.certNo}`}
      </button>

      {status && <p className="mt-2 text-center text-xs text-slate-600">{status}</p>}

      {(excelLoading || excelSync || partialSuccess) && (
        <div className="mt-3">
          <ExcelSyncPanel
            result={excelSync}
            loading={excelLoading}
            partialSuccess={partialSuccess}
            partialMessage={partialMessage}
            onRetry={partialSuccess ? retryExcel : undefined}
            onClose={clearExcelSync}
          />
        </div>
      )}
    </div>
  )
}
