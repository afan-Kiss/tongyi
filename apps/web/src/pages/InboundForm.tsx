import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useSearchParams } from 'react-router-dom'

import { AnimatedTabs } from '@/components/ui/AnimatedTabs'

import { CertNoAutocomplete } from '@/components/CertNoAutocomplete'

import { ExcelSyncPanel } from '@/components/ExcelSyncPanel'

import { InboundPhotoCapture, type InboundPhotoCaptureHandle } from '@/components/InboundPhotoCapture'

import { LabelPrintEditor } from '@/components/LabelPrintEditor'

import { LabelPrintPanel } from '@/components/LabelPrintPanel'

import { LabelPrintPreview } from '@/components/LabelPrintPreview'

import { CertExistsDialog } from '@/components/CertExistsDialog'

import { AppMessageDialog } from '@/components/AppMessageDialog'

import { useRegisterInbound, useReturnInbound } from '@/hooks/useScanWorkbench'

import { api } from '@/lib/api'

import { printBraceletTag } from '@/lib/printBraceletTag'
import { formatPrintSentMessage } from '@/lib/formatPrintSentMessage'

import type { Bracelet, BraceletDetail, CertIndexEntry } from '@/api/types'

import {

  loadInboundKind,

  loadNewInboundMemory,

  loadReturnInboundMemory,

  saveInboundKind,

  saveNewInboundMemory,

  saveReturnInboundMemory,

  type InboundKind,

} from '@/lib/inboundFormStorage'

import { loadLabelPrintMemory, saveLabelPrintMemory, getBarcodeDigits, createDefaultLabelPrintMemory, type LabelPrintMemory } from '@/lib/labelPrintMemory'
import { fillLabelLinesFromForm } from '@/lib/labelPrintSync'
import { emitInventoryRefresh } from '@/lib/inventoryRefresh'

const BASIC_FIELDS = [

  ['arrivalDate', '到货日期'],

  ['batch', '批次'],

  ['category', '品类'],

  ['ringSize', '圈口'],

  ['cost', '成本'],

  ['remark', '备注'],

] as const



function parseInboundKind(raw: string | null): InboundKind {
  if (raw === 'return') return 'return'
  if (raw === 'register' || raw === 'new') return 'register'
  return loadInboundKind()
}



export const InboundFormPage: React.FC = () => {

  const [params, setParams] = useSearchParams()

  const initialKind = parseInboundKind(params.get('type'))

  const [kind, setKind] = useState<InboundKind>(initialKind)



  const newMem = loadNewInboundMemory()

  const returnMem = loadReturnInboundMemory()



  const urlCertNo = params.get('certNo') || ''

  const [form, setForm] = useState({

    certNo: urlCertNo,

    arrivalDate: newMem.arrivalDate,

    batch: newMem.batch,

    category: newMem.category,

    ringSize: newMem.ringSize,

    cost: newMem.cost,

    remark: newMem.remark,

  })

  const [detail, setDetail] = useState<Partial<BraceletDetail>>(newMem.detail)
  const [labelMemory, setLabelMemory] = useState<LabelPrintMemory>(() => loadLabelPrintMemory())

  const [returnRemark, setReturnRemark] = useState(returnMem.remarkText)

  const [returnCertNo, setReturnCertNo] = useState(() => {

    return initialKind === 'return' ? urlCertNo : ''

  })



  const [status, setStatus] = useState('')

  const [lookupMsg, setLookupMsg] = useState('')

  const [certExists, setCertExists] = useState<{ certNo: string; bracelet?: Bracelet | null } | null>(null)

  const [messageDialog, setMessageDialog] = useState<{
    title: string
    message: string
    variant?: 'error' | 'success' | 'info'
  } | null>(null)

  const [returnTarget, setReturnTarget] = useState<Bracelet | null>(null)

  const [created, setCreated] = useState<Bracelet | null>(null)
  const [excelHint, setExcelHint] = useState('')
  const [indexHint, setIndexHint] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const photoRef = useRef<InboundPhotoCaptureHandle>(null)

  const registerInbound = useRegisterInbound()
  const returnInbound = useReturnInbound()

  const active = kind === 'register' ? registerInbound : returnInbound

  const loadFromExcel = useCallback(async (certOverride?: string) => {
    const code = (certOverride ?? form.certNo).trim().toUpperCase()
    if (!code) {
      setExcelHint('请先填写编号')
      return
    }
    setExcelHint('正在从索引读取…')
    try {
      const r = await api.excelRowPreview(code)
      const row = r.data
      setForm((f) => ({
        ...f,
        certNo: code,
        arrivalDate: row.arrivalDate || f.arrivalDate,
        batch: row.batch || f.batch,
        category: row.category || f.category,
        ringSize: row.ringSize || f.ringSize,
        cost: row.cost || f.cost,
        remark: row.remark || f.remark,
      }))
      setLabelMemory((mem) =>
        fillLabelLinesFromForm(
          { ...mem, barcodeManual: false, priceManual: false },
          {
            certNo: code,
            batch: row.batch,
            ringSize: row.ringSize,
            cost: row.cost,
          },
          { overwriteBarcode: true, overwritePrice: true },
        ),
      )
      setExcelHint(row.excelRow ? `已从索引预填（Excel 第 ${row.excelRow} 行，未改 Excel）` : '已从索引预填')
    } catch (e) {
      setExcelHint(e instanceof Error ? e.message : String(e))
    }
  }, [form.certNo])

  useEffect(() => {
    let cancelled = false
    api.excelCertIndexStatus()
      .then((r) => {
        if (cancelled) return
        const s = r.data
        setIndexHint(s.ready ? `Excel 编号索引：${s.count} 条` : s.message)
      })
      .catch(() => {
        if (!cancelled) setIndexHint('')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {

    saveInboundKind(kind)

    const next = new URLSearchParams()

    next.set('type', kind)

    if (kind === 'return') {

      if (returnCertNo.trim()) next.set('certNo', returnCertNo.trim().toUpperCase())

    } else if (form.certNo.trim()) {

      next.set('certNo', form.certNo.trim().toUpperCase())

    }

    setParams(next, { replace: true })

  }, [kind, returnCertNo, form.certNo, setParams])



  useEffect(() => {

    saveNewInboundMemory({

      arrivalDate: form.arrivalDate,

      batch: form.batch,

      category: form.category,

      ringSize: form.ringSize,

      cost: form.cost,

      remark: form.remark,

      detail,

    })

  }, [form.arrivalDate, form.batch, form.category, form.ringSize, form.cost, form.remark, detail])



  useEffect(() => {
    saveLabelPrintMemory(labelMemory)
  }, [labelMemory])

  useEffect(() => {
    if (kind !== 'register') return
    setLabelMemory((mem) => {
      const next = fillLabelLinesFromForm(
        mem,
        {
          certNo: form.certNo,
          ringSize: form.ringSize,
          cost: form.cost,
          batch: form.batch,
        },
        { overwriteBarcode: false, overwritePrice: false },
      )
      const unchanged =
        next.lineFormats.cert === mem.lineFormats.cert &&
        next.lineFormats.ring === mem.lineFormats.ring &&
        next.lineFormats.price === mem.lineFormats.price &&
        next.lineFormats.barcode === mem.lineFormats.barcode
      return unchanged ? mem : next
    })
  }, [kind, form.certNo, form.ringSize, form.cost, form.batch])

  useEffect(() => {

    saveReturnInboundMemory({ remarkText: returnRemark })

  }, [returnRemark])



  useEffect(() => {

    const code = returnCertNo.trim().toUpperCase()

    if (kind !== 'return' || !code) {

      setReturnTarget(null)

      setLookupMsg('')

      return

    }

    let cancelled = false

    setLookupMsg('正在查询…')

    api.getByCert(code)

      .then((r) => {

        if (cancelled) return

        const b = r.data

        setReturnTarget(b)

        if (b.qty === 1) {

          setLookupMsg(`${code} 已在库，无需退货入库`)

        } else {

          setLookupMsg(

            `已售出${b.soldDate ? `（${b.soldDate}）` : ''}${b.actualPrice ? ` · 售价 ${b.actualPrice}` : ''}，确认后恢复在库`,

          )

        }

      })

      .catch((e) => {

        if (cancelled) return

        setReturnTarget(null)

        setLookupMsg(e instanceof Error ? e.message : String(e))

      })

    return () => { cancelled = true }

  }, [kind, returnCertNo])

  const isCertExistsError = (msg: string) => msg.includes('已存在') || msg.includes('已在系统中')

  const showCertExists = useCallback((certNo: string, bracelet?: Bracelet | null) => {
    const code = certNo.trim().toUpperCase()
    if (!code) return
    setCertExists({ certNo: code, bracelet })
  }, [])

  const resetRegisterWorkbench = useCallback(() => {
    const mem = loadNewInboundMemory()
    setForm({
      certNo: '',
      arrivalDate: mem.arrivalDate,
      batch: mem.batch,
      category: mem.category,
      ringSize: '',
      cost: '',
      remark: mem.remark,
    })
    setDetail({ ...mem.detail })
    const freshLabel = createDefaultLabelPrintMemory()
    saveLabelPrintMemory(freshLabel)
    setLabelMemory(freshLabel)
    setCreated(null)
    setStatus('')
    setExcelHint('')
    setCertExists(null)
    setParams(new URLSearchParams({ type: 'register' }), { replace: true })
    emitInventoryRefresh()
  }, [setParams])

  const onSubmitRegister = async () => {
    if (!form.certNo.trim()) {
      setMessageDialog({ title: '请填写编号', message: '标签入库需要先填写手写编号。', variant: 'info' })
      return
    }
    setSubmitting(true)
    setStatus('正在登记到系统…')
    try {
      try {
        const existing = await api.getByCertDbOnly(form.certNo.trim())
        showCertExists(form.certNo, existing.data)
        setStatus('')
        return
      } catch {
        // 数据库无记录，继续登记
      }
      const hasDetail = !!(detail.description && String(detail.description).trim())
      const barcodeValue = getBarcodeDigits(labelMemory)
      const data = await registerInbound.submit({
        ...form,
        barcodeValue: barcodeValue || undefined,
        labelPrice: labelMemory.lineFormats.price?.trim() || undefined,
        detail: hasDetail ? { description: detail.description } : undefined,
      })
      setCreated(data.bracelet)
      let photoWarn = ''
      if (photoRef.current?.pendingCount()) {
        try {
          await photoRef.current.flushPending(data.bracelet.certNo)
        } catch (photoErr) {
          photoWarn = `照片上传失败：${photoErr instanceof Error ? photoErr.message : String(photoErr)}`
        }
      }
      const msg = data.excelSync?.message || '已登记到系统（未修改 Excel）'
      setStatus(photoWarn ? `${msg} · ${photoWarn}` : `${msg}，正在打印吊牌…`)
      try {
        await printBraceletTag(data.bracelet, { labelMemory })
        const dialogMsg = formatPrintSentMessage({
          bracelet: data.bracelet,
          labelMemory,
          excelSync: data.excelSync,
        })
        resetRegisterWorkbench()
        setStatus(photoWarn ? `${dialogMsg} · ${photoWarn}` : dialogMsg)
        setMessageDialog({ title: '打印已发送', message: dialogMsg, variant: 'success' })
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        const fail = photoWarn ? `${msg} · ${photoWarn} · 打印失败：${err}` : `${msg}，但打印失败：${err}`
        setStatus(fail)
        setMessageDialog({ title: '打印失败', message: fail, variant: 'error' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (isCertExistsError(msg)) {
        setStatus('')
        try {
          const r = await api.getByCertDbOnly(form.certNo.trim())
          showCertExists(form.certNo, r.data)
        } catch {
          showCertExists(form.certNo)
        }
      } else {
        setStatus(msg)
        setMessageDialog({ title: '登记失败', message: msg, variant: 'error' })
      }
    } finally {
      setSubmitting(false)
    }
  }



  const onSubmitReturn = async () => {

    const code = returnCertNo.trim().toUpperCase()

    if (!code) {

      setStatus('请填写编号')

      return

    }

    if (!returnTarget) {

      setStatus(lookupMsg || '请先查询有效编号')

      return

    }

    if (returnTarget.qty === 1) {

      setStatus(`${code} 已在库`)

      return

    }

    try {

      const data = await returnInbound.submit(code, returnRemark)

      setCreated(data.bracelet)

      setStatus(data.partialSuccess ? '退货入库成功（Excel 待同步）' : '退货入库成功')

    } catch (e) {

      setStatus(e instanceof Error ? e.message : String(e))

    }

  }



  const switchKind = (next: InboundKind) => {

    setKind(next)

    setStatus('')

    setCreated(null)

    active.clearExcelSync()

  }



  return (

    <div className="mx-auto max-w-lg space-y-4">

      <h2 className="text-xl font-semibold text-slate-900">入库</h2>



      <AnimatedTabs

        items={[
          { key: 'register', label: '标签入库' },
          { key: 'return', label: '退货入库' },
        ]}

        activeKey={kind}

        onChange={(k) => switchKind(k as InboundKind)}

      />



      {kind === 'register' ? (
        <>
          <p className="text-xs text-slate-500">
            Excel 里已有信息的镯子：填写编号与信息，登记进系统后打印吊牌贴标。<strong>不会修改 Excel</strong>。
          </p>

          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm space-y-3">
            <label className="block text-sm">
              <span className="text-slate-500">编号 *</span>
              <CertNoAutocomplete
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-semibold tracking-wider"
                value={form.certNo}
                onChange={(certNo) => setForm((f) => ({ ...f, certNo }))}
                onSelect={(entry: CertIndexEntry) => { void loadFromExcel(entry.certNo) }}
                onBlur={() => { if (form.certNo.trim()) void loadFromExcel() }}
                placeholder="填写手写标签上的编号，输入时联想"
              />
            </label>
            {indexHint && <p className="text-[11px] text-slate-400">{indexHint}</p>}
            <button
              type="button"
              disabled={submitting || !form.certNo.trim()}
              onClick={() => loadFromExcel()}
              className="text-[11px] text-slate-500 underline"
            >
              从索引预填（只读，不改 Excel）
            </button>
            {excelHint && <p className="text-[11px] text-slate-400">{excelHint}</p>}
          </div>



          <div className="rounded-2xl border border-rose-50 bg-rose-50/20 p-4 shadow-sm">

            <h3 className="mb-2 text-sm font-semibold text-slate-800">基础信息（同步 Excel）</h3>

            <div className="grid gap-3">

              {BASIC_FIELDS.map(([key, label]) => (

                <label key={key} className="block text-sm">

                  <span className="text-slate-500">{label}</span>

                  <input

                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"

                    value={form[key]}

                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}

                  />

                </label>

              ))}

            </div>

          </div>



          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 shadow-sm">
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

          <div className="rounded-2xl border border-violet-100 bg-violet-50/20 p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">实时拍照</h3>
            <p className="mb-2 text-[11px] text-slate-500">电脑填标签，手机扫一次码即可；换编号不用重扫，画面实时同步</p>
            <InboundPhotoCapture
              ref={photoRef}
              certNo={form.certNo}
              deferUpload
              disabled={submitting}
            />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">吊牌打印</h3>
            <LabelPrintEditor
              memory={labelMemory}
              onChange={setLabelMemory}
              formSync={{
                certNo: form.certNo,
                ringSize: form.ringSize,
                cost: form.cost,
                batch: form.batch,
              }}
            />
          </div>

          <LabelPrintPreview labelMemory={labelMemory} />

          <button
            type="button"
            disabled={submitting || !form.certNo.trim()}
            onClick={onSubmitRegister}
            className="w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? '处理中…' : '确认登记并打印吊牌'}
          </button>

        </>

      ) : (

        <>

          <p className="text-xs text-slate-500">

            扫已售出的编号：恢复在库、写入退货日期，并清空售出/售价。退货备注会自动记住上次内容。

          </p>



          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm space-y-3">

            <label className="block text-sm">

              <span className="text-slate-500">编号 *</span>

              <CertNoAutocomplete

                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"

                value={returnCertNo}

                onChange={setReturnCertNo}

                placeholder="扫已售出的编号，输入时联想"

              />

            </label>

            {lookupMsg && (

              <p className={`text-xs ${returnTarget?.qty === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>

                {lookupMsg}

              </p>

            )}

            {returnTarget && (

              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">

                <div><span className="text-slate-400">圈口</span> {returnTarget.ringSize || '—'}</div>

                <div><span className="text-slate-400">批次</span> {returnTarget.batch || '—'}</div>

                <div><span className="text-slate-400">售出</span> {returnTarget.soldDate || '—'}</div>

                <div><span className="text-slate-400">售价</span> {returnTarget.actualPrice || '—'}</div>

              </div>

            )}

            <label className="block text-sm">

              <span className="text-slate-500">退货备注（写入 Excel 备注列）</span>

              <input

                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"

                value={returnRemark}

                onChange={(e) => setReturnRemark(e.target.value)}

                placeholder="退货入库"

              />

            </label>

          </div>



          <button

            type="button"

            onClick={onSubmitReturn}

            disabled={!returnTarget || returnTarget.qty === 1}

            className="w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white disabled:opacity-50"

          >

            确认退货入库

          </button>

        </>

      )}



      {status && <p className="text-center text-sm text-slate-600">{status}</p>}

      {(active.excelLoading || active.excelSync || active.partialSuccess) && kind === 'return' && (
        <ExcelSyncPanel
          result={active.excelSync}
          loading={active.excelLoading}
          partialSuccess={active.partialSuccess}
          partialMessage={active.partialMessage}
          onRefresh={created ? () => active.refreshSnapshot(created.certNo) : undefined}
          onRetry={active.partialSuccess ? active.retryExcel : undefined}
          onClose={active.clearExcelSync}
        />
      )}

      {created && kind === 'register' && (
        <LabelPrintPanel bracelet={created} label="重新打印吊牌" labelMemory={labelMemory} />
      )}

      <CertExistsDialog
        open={certExists !== null}
        certNo={certExists?.certNo || ''}
        bracelet={certExists?.bracelet}
        onClose={() => setCertExists(null)}
      />

      <AppMessageDialog
        open={messageDialog !== null}
        title={messageDialog?.title || ''}
        message={messageDialog?.message || ''}
        variant={messageDialog?.variant}
        onClose={() => setMessageDialog(null)}
      />
    </div>
  )
}


