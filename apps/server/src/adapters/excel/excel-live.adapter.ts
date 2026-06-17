/**
 * Excel 实时适配器 — 通过本地 Python 桥接服务操控已打开的 Excel。
 * 前端不直接访问此层，仅由后端 services 调用。
 */
import { getExcelBridgeUrl, isExcelBridgeEnabled } from '../../config/env'
import type { ExcelSyncResult } from '../../types/api.types'

async function callBridge(path: string, init?: RequestInit): Promise<ExcelSyncResult> {
  const res = await fetch(`${getExcelBridgeUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20000),
  })
  const data = (await res.json()) as ExcelSyncResult
  return {
    ok: !!data.ok,
    message: data.message || (data.ok ? 'Excel 同步成功' : 'Excel 同步失败'),
    row: data.row,
    sheet: data.sheet,
    snapshotBase64: data.snapshotBase64,
    verify: data.verify,
  }
}

export async function syncOutboundToExcel(payload: Record<string, unknown>): Promise<ExcelSyncResult> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 实时同步未启用' }
  }
  try {
    return await callBridge('/sync/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { ok: false, message: `Excel 桥接不可用: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function syncInboundToExcel(payload: Record<string, unknown>): Promise<ExcelSyncResult> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 实时同步未启用' }
  }
  try {
    return await callBridge('/sync/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { ok: false, message: `Excel 桥接不可用: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function syncNewInboundToExcel(payload: Record<string, unknown>): Promise<ExcelSyncResult> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 实时同步未启用' }
  }
  try {
    return await callBridge('/sync/new_inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { ok: false, message: `Excel 桥接不可用: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function syncUpdateRowToExcel(payload: Record<string, unknown>): Promise<ExcelSyncResult> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 实时同步未启用' }
  }
  try {
    return await callBridge('/sync/update_row', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { ok: false, message: `Excel 桥接不可用: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export interface ExcelRowData {
  certNo: string
  arrivalDate?: string
  batch?: string
  qty: number
  category?: string
  ringSize?: string
  cost?: string
  remark?: string
  orderNo?: string
  returnDate?: string
  soldDate?: string
  actualPrice?: string
  salesPerson?: string
  salesChannel?: string
  excelRow?: number
  excelSheet?: string
}

export async function fetchExcelRowData(
  certNo: string,
  excelRow?: number | null,
  excelSheet?: string | null,
): Promise<{ ok: boolean; message: string; data?: ExcelRowData }> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 桥接未启用' }
  }
  try {
    const q = new URLSearchParams()
    if (excelRow) q.set('row', String(excelRow))
    if (excelSheet) q.set('sheet', excelSheet)
    const suffix = q.toString() ? `?${q}` : ''
    const res = await fetch(`${getExcelBridgeUrl()}/row/${encodeURIComponent(certNo)}${suffix}`, {
      signal: AbortSignal.timeout(10000),
    })
    const body = (await res.json()) as { ok?: boolean; message?: string; data?: ExcelRowData }
    if (!body.ok || !body.data?.certNo) {
      return { ok: false, message: body.message || `Excel 中未找到 ${certNo}` }
    }
    return { ok: true, message: body.message || '已从 Excel 读取', data: body.data }
  } catch (e) {
    return { ok: false, message: `Excel 桥接不可用: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function fetchExcelRowSnapshot(certNo: string): Promise<ExcelSyncResult> {
  try {
    return await callBridge(`/snapshot/${encodeURIComponent(certNo)}`)
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function precheckExcelRow(
  certNo: string,
  excelRow?: number | null,
  excelSheet?: string | null,
): Promise<ExcelSyncResult> {
  if (!isExcelBridgeEnabled()) {
    return { ok: true, message: 'Excel 桥接未启用，跳过预检' }
  }
  try {
    const q = new URLSearchParams()
    if (excelRow) q.set('row', String(excelRow))
    if (excelSheet) q.set('sheet', excelSheet)
    const suffix = q.toString() ? `?${q}` : ''
    return await callBridge(`/precheck/${encodeURIComponent(certNo)}${suffix}`)
  } catch (e) {
    return { ok: false, message: `Excel 预检失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function revertExcelRow(payload: Record<string, unknown>): Promise<ExcelSyncResult> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 桥接未启用' }
  }
  try {
    return await callBridge('/sync/revert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    return { ok: false, message: `Excel 撤销失败: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function fetchNextCertNoFromExcel(prefix: string): Promise<{
  ok: boolean
  message: string
  certNo?: string
  nextNum?: number
  excelMax?: number
  width?: number
}> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 桥接未启用' }
  }
  try {
    const q = new URLSearchParams({ prefix })
    const res = await fetch(`${getExcelBridgeUrl()}/next-cert-no?${q}`, {
      signal: AbortSignal.timeout(10000),
    })
    const body = (await res.json()) as {
      ok?: boolean
      message?: string
      certNo?: string
      nextNum?: number
      excelMax?: number
    }
    if (!body.ok || !body.certNo) {
      return { ok: false, message: body.message || '无法从 Excel 取号' }
    }
    const parsed = body.certNo.match(/^([A-Z]+)(\d+)$/i)
    const width = parsed ? parsed[2].length : undefined
    return {
      ok: true,
      message: body.message || '已从 Excel 取号',
      certNo: body.certNo,
      nextNum: body.nextNum,
      excelMax: body.excelMax,
      width,
    }
  } catch (e) {
    return { ok: false, message: `Excel 桥接不可用: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function checkExcelBridgeHealth(): Promise<{
  online: boolean
  message: string
  workbook?: string
  sheet?: string
}> {
  try {
    const res = await fetch(`${getExcelBridgeUrl()}/health`, { signal: AbortSignal.timeout(3000) })
    const data = (await res.json()) as {
      ok?: boolean
      bound?: boolean
      workbook?: string
      sheet?: string
      message?: string
    }
    if (!data.ok) return { online: false, message: data.message || '桥接异常' }
    if (data.bound && data.workbook) {
      return { online: true, message: `已绑定 ${data.workbook} / ${data.sheet || ''}`, workbook: data.workbook, sheet: data.sheet }
    }
    return { online: true, message: '在线，请打开 Excel 工作簿' }
  } catch {
    return { online: false, message: 'Excel 桥接服务离线' }
  }
}

export interface CertIndexEntry {
  certNo: string
  sheet: string
  row: number
  batch?: string
  category?: string
  qty?: number
  arrivalDate?: string
  ringSize?: string
  cost?: string
  remark?: string
  orderNo?: string
  returnDate?: string
  soldDate?: string
  actualPrice?: string
  salesPerson?: string
  salesChannel?: string
}

export async function fetchCertIndexFromBridge(refresh = false): Promise<{
  ok: boolean
  message: string
  entries?: CertIndexEntry[]
  count?: number
  builtAt?: string | null
  workbook?: string
}> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 桥接未启用' }
  }
  try {
    if (refresh) {
      const refreshRes = await fetch(`${getExcelBridgeUrl()}/cert-index/refresh`, {
        method: 'POST',
        signal: AbortSignal.timeout(120000),
      })
      const refreshBody = (await refreshRes.json()) as { ok?: boolean; message?: string }
      if (!refreshBody.ok) {
        return { ok: false, message: refreshBody.message || '刷新索引失败' }
      }
    }
    const res = await fetch(`${getExcelBridgeUrl()}/cert-index`, {
      signal: AbortSignal.timeout(120000),
    })
    const body = (await res.json()) as {
      ok?: boolean
      message?: string
      entries?: CertIndexEntry[]
      count?: number
      builtAt?: string | null
      workbook?: string
    }
    if (!body.ok || !body.entries) {
      return { ok: false, message: body.message || '无法读取编号索引' }
    }
    return {
      ok: true,
      message: body.message || `已加载 ${body.entries.length} 条`,
      entries: body.entries,
      count: body.count ?? body.entries.length,
      builtAt: body.builtAt,
      workbook: body.workbook,
    }
  } catch (e) {
    return { ok: false, message: `Excel 桥接不可用: ${e instanceof Error ? e.message : String(e)}` }
  }
}
