import { useCallback, useState } from 'react'

import { operationsApi } from '@/api/endpoints'

import type { ExcelSyncResult, OpResult, OutboundBody } from '@/api/types'



/**

 * 扫码工作台交互逻辑 — 前端只负责状态与 UI 编排，业务由后端处理

 */

export function useScanWorkbench() {

  const [excelSync, setExcelSync] = useState<ExcelSyncResult | null>(null)

  const [excelLoading, setExcelLoading] = useState(false)

  const [lastCertNo, setLastCertNo] = useState('')

  const [lastLogId, setLastLogId] = useState('')

  const [partialSuccess, setPartialSuccess] = useState(false)

  const [partialMessage, setPartialMessage] = useState('')



  const applyResult = useCallback((data: OpResult) => {

    setExcelSync(data.excelSync || null)

    setLastLogId(data.logId)

    setPartialSuccess(!!data.partialSuccess)

    setPartialMessage(data.partialMessage || '')

    return data

  }, [])



  const runWithExcel = useCallback(async (certNo: string, action: () => Promise<{ data: OpResult }>) => {

    setExcelLoading(true)

    setExcelSync(null)

    setPartialSuccess(false)

    setPartialMessage('')

    setLastCertNo(certNo)

    try {

      const res = await action()

      return applyResult(res.data)

    } finally {

      setExcelLoading(false)

    }

  }, [applyResult])



  const doInbound = useCallback(

    (certNo: string, remarkText?: string) =>

      runWithExcel(certNo, () => operationsApi.inbound({ certNo, remarkText })),

    [runWithExcel],

  )



  const doOutbound = useCallback(

    (body: OutboundBody) =>

      runWithExcel(body.certNo, () => operationsApi.outbound(body)),

    [runWithExcel],

  )



  const retryExcel = useCallback(async () => {

    if (!lastLogId) return

    setExcelLoading(true)

    try {

      const res = await operationsApi.retryExcel(lastLogId)

      applyResult(res.data)

    } catch (e) {

      setExcelSync({ ok: false, message: e instanceof Error ? e.message : String(e) })

    } finally {

      setExcelLoading(false)

    }

  }, [lastLogId, applyResult])



  const refreshSnapshot = useCallback(async (certNo?: string) => {

    const code = certNo || lastCertNo

    if (!code) return

    setExcelLoading(true)

    try {

      const res = await operationsApi.excelSnapshot(code)

      setExcelSync(res.data)

    } catch (e) {

      setExcelSync({ ok: false, message: e instanceof Error ? e.message : String(e) })

    } finally {

      setExcelLoading(false)

    }

  }, [lastCertNo])



  const clearExcelSync = useCallback(() => {

    setExcelSync(null)

    setPartialSuccess(false)

    setPartialMessage('')

  }, [])



  return {

    excelSync,

    excelLoading,

    lastCertNo,

    lastLogId,

    partialSuccess,

    partialMessage,

    setLastCertNo,

    doInbound,

    doOutbound,

    retryExcel,

    refreshSnapshot,

    clearExcelSync,

  }

}



export function useRegisterInbound() {
  const submit = useCallback(async (body: Parameters<typeof operationsApi.register>[0]) => {
    const res = await operationsApi.register(body)
    return res.data
  }, [])
  return {
    excelSync: null,
    excelLoading: false,
    partialSuccess: false,
    partialMessage: '',
    lastLogId: '',
    submit,
    retryExcel: async () => {},
    refreshSnapshot: async () => {},
    clearExcelSync: () => {},
  }
}

export function useNewInbound() {

  const [excelSync, setExcelSync] = useState<ExcelSyncResult | null>(null)

  const [excelLoading, setExcelLoading] = useState(false)

  const [partialSuccess, setPartialSuccess] = useState(false)

  const [partialMessage, setPartialMessage] = useState('')

  const [lastLogId, setLastLogId] = useState('')



  const submit = useCallback(async (body: Parameters<typeof operationsApi.createNew>[0]) => {

    setExcelLoading(true)

    setExcelSync(null)

    setPartialSuccess(false)

    setPartialMessage('')

    try {

      const res = await operationsApi.createNew(body)

      setExcelSync(res.data.excelSync || null)

      setLastLogId(res.data.logId)

      setPartialSuccess(!!res.data.partialSuccess)

      setPartialMessage(res.data.partialMessage || '')

      return res.data

    } finally {

      setExcelLoading(false)

    }

  }, [])



  const retryExcel = useCallback(async () => {

    if (!lastLogId) return

    setExcelLoading(true)

    try {

      const res = await operationsApi.retryExcel(lastLogId)

      setExcelSync(res.data.excelSync || null)

      setPartialSuccess(!!res.data.partialSuccess)

      setPartialMessage(res.data.partialMessage || '')

    } finally {

      setExcelLoading(false)

    }

  }, [lastLogId])



  const refreshSnapshot = useCallback(async (certNo: string) => {

    setExcelLoading(true)

    try {

      const res = await operationsApi.excelSnapshot(certNo)

      setExcelSync(res.data)

    } finally {

      setExcelLoading(false)

    }

  }, [])



  return {

    excelSync,

    excelLoading,

    partialSuccess,

    partialMessage,

    lastLogId,

    submit,

    retryExcel,

    refreshSnapshot,

    clearExcelSync: () => {

      setExcelSync(null)

      setPartialSuccess(false)

      setPartialMessage('')

    },

  }

}



export function useReturnInbound() {

  const [excelSync, setExcelSync] = useState<ExcelSyncResult | null>(null)

  const [excelLoading, setExcelLoading] = useState(false)

  const [partialSuccess, setPartialSuccess] = useState(false)

  const [partialMessage, setPartialMessage] = useState('')

  const [lastLogId, setLastLogId] = useState('')



  const submit = useCallback(async (certNo: string, remarkText?: string) => {

    setExcelLoading(true)

    setExcelSync(null)

    setPartialSuccess(false)

    setPartialMessage('')

    try {

      const res = await operationsApi.inbound({ certNo, remarkText })

      setExcelSync(res.data.excelSync || null)

      setLastLogId(res.data.logId)

      setPartialSuccess(!!res.data.partialSuccess)

      setPartialMessage(res.data.partialMessage || '')

      return res.data

    } finally {

      setExcelLoading(false)

    }

  }, [])



  const retryExcel = useCallback(async () => {

    if (!lastLogId) return

    setExcelLoading(true)

    try {

      const res = await operationsApi.retryExcel(lastLogId)

      setExcelSync(res.data.excelSync || null)

      setPartialSuccess(!!res.data.partialSuccess)

      setPartialMessage(res.data.partialMessage || '')

    } finally {

      setExcelLoading(false)

    }

  }, [lastLogId])



  const refreshSnapshot = useCallback(async (certNo: string) => {

    setExcelLoading(true)

    try {

      const res = await operationsApi.excelSnapshot(certNo)

      setExcelSync(res.data)

    } finally {

      setExcelLoading(false)

    }

  }, [])



  return {

    excelSync,

    excelLoading,

    partialSuccess,

    partialMessage,

    lastLogId,

    submit,

    retryExcel,

    refreshSnapshot,

    clearExcelSync: () => {

      setExcelSync(null)

      setPartialSuccess(false)

      setPartialMessage('')

    },

  }

}

