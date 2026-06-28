import React, { useEffect, useState } from 'react'

import type { Bracelet, ExcelSyncResult } from '@/api/types'

import { inventoryApi } from '@/api/endpoints'

import { useScanWorkbench } from '@/hooks/useScanWorkbench'

import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'

import { OutboundFormFields } from '@/components/OutboundFormFields'

import { emitInventoryRefresh } from '@/lib/inventoryRefresh'

import {

  loadOutboundFormMemory,

  saveOutboundFormMemory,

  saveOutboundSalesSelection,

  rememberSalesPerson,

  type SalesChannel,

} from '@/lib/outboundFormMemory'



type Workbench = ReturnType<typeof useScanWorkbench>



interface Props {

  bracelet: Bracelet

  onUpdated?: (b: Bracelet) => void

  defaultInboundRemark?: string

  /** 已出库重新入库时是否显示备注输入框（退货入库等场景可开启） */
  showInboundRemark?: boolean

  /** 为 false 时不请求小红书订单（详情右侧栏需鼠标停留 2 秒后才为 true） */
  orderLoadActive?: boolean
  /** 鼠标已在区域内、尚未到加载时间 */
  orderLoadHovering?: boolean
  /** 倒计时剩余秒数 */
  orderLoadSecondsLeft?: number

  defaultOutboundRemark?: string

  hint?: string

  workbench?: Workbench

  embedExcelSync?: boolean

  /** 嵌入右侧出入库窗口时使用，去掉外层卡片样式 */
  embedded?: boolean

  /** 同时展示入库、出库（弹窗右侧栏），分别同步 Excel */
  bothStockActions?: boolean

  /** 扫码「退货入库」：入库按钮文案为「确认重新入库」 */
  inboundReturnMode?: boolean

  /** 覆盖入库确认按钮文案 */
  inboundConfirmLabel?: string

  onExcelSyncChange?: (sync: ExcelSyncResult | null, partial: boolean) => void

}



export const StockOpPanel: React.FC<Props> = ({

  bracelet,

  onUpdated,

  defaultInboundRemark = '',

  showInboundRemark = false,

  orderLoadActive = true,

  orderLoadHovering = false,

  orderLoadSecondsLeft = 2,

  defaultOutboundRemark,

  hint,

  workbench: workbenchProp,

  embedExcelSync = true,

  embedded = false,

  bothStockActions = false,

  inboundReturnMode = false,

  inboundConfirmLabel,

  onExcelSyncChange,

}) => {

  const outboundMem = loadOutboundFormMemory()

  const [inboundRemark, setInboundRemark] = useState(defaultInboundRemark)

  const [priceText, setPriceText] = useState('')

  const [orderNo, setOrderNo] = useState('')

  const [remarkText, setRemarkText] = useState(defaultOutboundRemark ?? outboundMem.remarkText)

  const [salesPerson, setSalesPerson] = useState(outboundMem.salesPerson)

  const [salesChannel, setSalesChannel] = useState<SalesChannel>(outboundMem.salesChannel)

  const [salesPersonOptions, setSalesPersonOptions] = useState(outboundMem.salesPersons)

  const [status, setStatus] = useState('')
  const [statusKind, setStatusKind] = useState<'info' | 'error' | 'success'>('info')

  const [busy, setBusy] = useState(false)



  const internalWorkbench = useScanWorkbench()

  const workbench = workbenchProp ?? internalWorkbench

  const {

    excelSync, excelLoading, partialSuccess, partialMessage,

    doInbound, doOutbound, retryExcel, clearExcelSync,

  } = workbench



  useEffect(() => {

    onExcelSyncChange?.(excelSync, partialSuccess)

  }, [excelSync, partialSuccess, onExcelSyncChange])



  useEffect(() => {

    setInboundRemark(defaultInboundRemark)

  }, [defaultInboundRemark, bracelet.certNo])



  const refresh = async () => {

    const r = await inventoryApi.getByCert(bracelet.certNo)

    onUpdated?.(r.data)

    return r.data

  }



  const showStatus = (message: string, kind: 'info' | 'error' | 'success' = 'info') => {
    setStatus(message)
    setStatusKind(kind)
  }

  const handleSalesPersonCommit = (person: string) => {
    rememberSalesPerson(person)
    setSalesPersonOptions(loadOutboundFormMemory().salesPersons)
  }

  const handleSalesChannelChange = (channel: SalesChannel) => {
    setSalesChannel(channel)
    saveOutboundFormMemory({ salesChannel: channel })
  }

  const confirmInbound = async () => {
    if (busy) return
    setBusy(true)
    setStatus('')
    setStatusKind('info')
    clearExcelSync()
    try {
      const result = await doInbound(bracelet.certNo, inboundRemark)
      showStatus(`${bracelet.certNo} 入库成功${result.partialSuccess ? '（Excel 待同步）' : ''}`, 'success')
      await refresh()
      emitInventoryRefresh()
    } catch (e) {
      showStatus(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }



  const confirmOutbound = async () => {
    if (busy) return

    if (!salesPerson.trim()) {
      showStatus('请输入销售人员', 'error')
      return
    }

    if (salesChannel !== '线上' && salesChannel !== '线下') {
      showStatus('请选择销售渠道（线上/线下）', 'error')
      return
    }

    setBusy(true)
    setStatus('')
    setStatusKind('info')
    clearExcelSync()

    try {

      const result = await doOutbound({

        certNo: bracelet.certNo,

        priceText,

        remarkText,

        orderNo,

        salesPerson: salesPerson.trim(),

        salesChannel,

      })

      saveOutboundSalesSelection(salesPerson.trim(), salesChannel)

      saveOutboundFormMemory({ remarkText })

      showStatus(`${bracelet.certNo} 出库成功${result.partialSuccess ? '（Excel 待同步）' : ''}`, 'success')

      await refresh()

      emitInventoryRefresh()

    } catch (e) {

      showStatus(e instanceof Error ? e.message : String(e), 'error')

    } finally {

      setBusy(false)

    }

  }



  const isOut = bracelet.qty === 0

  const confirmInboundLabel =
    inboundConfirmLabel || (inboundReturnMode ? '确认重新入库' : `确认入库 · ${bracelet.certNo}`)

  const statusBanner = status ? (
    <div
      className={`rounded-xl px-3 py-2 text-sm ${
        statusKind === 'error'
          ? 'border border-red-200 bg-red-50 text-red-700'
          : statusKind === 'success'
            ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
            : 'border border-slate-200 bg-slate-50 text-slate-700'
      }`}
      role="status"
    >
      {status}
    </div>
  ) : null

  const excelSyncBlock = embedExcelSync && (excelLoading || excelSync || partialSuccess) ? (
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
  ) : null



  if (bothStockActions) {

    const showRemark = showInboundRemark || inboundReturnMode

    return (

      <div className="space-y-4" data-no-scan-refocus>

        {statusBanner}

        {hint && <p className="text-sm text-slate-700">{hint}</p>}

        <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <h4 className="text-sm font-semibold text-slate-800">入库</h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {isOut
              ? '同步 Excel，恢复在库（数量改为 1）'
              : '当前已在库；可点入库同步 Excel 退货状态（数量=1、清除售出信息）'}
          </p>
          {showRemark && (
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="入库备注"
              value={inboundRemark}
              disabled={busy}
              onChange={(e) => setInboundRemark(e.target.value)}
            />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmInbound()}
            className="mt-2 w-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 disabled:opacity-50"
          >
            {busy ? '处理中…' : confirmInboundLabel}
          </button>
        </section>

        <section className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
          <h4 className="text-sm font-semibold text-slate-800">出库</h4>
          <p className="mt-0.5 text-xs text-slate-500">同步 Excel，登记售出（数量改为 0）</p>
          <div className="mt-2">
            <OutboundFormFields
              priceText={priceText}
              orderNo={orderNo}
              remarkText={remarkText}
              salesPerson={salesPerson}
              salesChannel={salesChannel}
              salesPersonOptions={salesPersonOptions}
              disabled={busy}
              orderPanelActive={orderLoadActive}
              orderLoadHovering={orderLoadHovering && !orderLoadActive}
              orderLoadSecondsLeft={orderLoadSecondsLeft}
              onPriceChange={setPriceText}
              onOrderNoChange={setOrderNo}
              onRemarkChange={setRemarkText}
              onSalesPersonChange={setSalesPerson}
              onSalesPersonCommit={handleSalesPersonCommit}
              onSalesChannelChange={handleSalesChannelChange}
            />
          </div>
          <button
            type="button"
            disabled={busy || !priceText.trim() || !salesPerson.trim()}
            onClick={() => void confirmOutbound()}
            className="mt-2 w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '处理中…' : `确认出库 · ${bracelet.certNo}`}
          </button>
        </section>

        {excelSyncBlock}

      </div>

    )

  }



  return (

    <div
      className={
        embedded
          ? ''
          : `rounded-2xl border p-4 shadow-sm ${isOut ? 'border-emerald-100 bg-emerald-50/40' : 'border-rose-100 bg-rose-50/30'}`
      }
    >

      <p className="text-sm text-slate-700">

        {hint || (isOut ? '该货品已出库，是否需要重新入库？' : '该货品在库，是否需要出库？')}

      </p>

      {isOut ? (
        showInboundRemark ? (
          <input
            className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="入库备注"
            value={inboundRemark}
            disabled={busy}
            onChange={(e) => setInboundRemark(e.target.value)}
          />
        ) : null
      ) : (

        <div className="mt-3" data-no-scan-refocus>

          <OutboundFormFields

            priceText={priceText}

            orderNo={orderNo}

            remarkText={remarkText}

            salesPerson={salesPerson}

            salesChannel={salesChannel}

            salesPersonOptions={salesPersonOptions}

            disabled={busy}

            orderPanelActive={!isOut && orderLoadActive}

            orderLoadHovering={!isOut && orderLoadHovering && !orderLoadActive}

            orderLoadSecondsLeft={orderLoadSecondsLeft}

            onPriceChange={setPriceText}

            onOrderNoChange={setOrderNo}

            onRemarkChange={setRemarkText}

            onSalesPersonChange={setSalesPerson}
            onSalesPersonCommit={handleSalesPersonCommit}
            onSalesChannelChange={handleSalesChannelChange}

          />

        </div>

      )}

      <button
        type="button"
        disabled={busy || (!isOut && (!priceText.trim() || !salesPerson.trim()))}
        onClick={() => void (isOut ? confirmInbound() : confirmOutbound())}
        className={`mt-3 w-full rounded-full py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
          isOut
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
            : 'bg-gradient-to-r from-[#ff2442] to-[#ff6b81]'
        }`}
      >
        {busy
          ? '处理中…'
          : isOut
            ? confirmInboundLabel
            : `确认出库 · ${bracelet.certNo}`}
      </button>

      {statusBanner}

      {excelSyncBlock}

    </div>

  )

}

