/**
 * Excel 实时适配器 — 通过本地 Python 桥接服务操控已打开的 Excel。
 * 前端不直接访问此层，仅由后端 services 调用。
 */
import { getExcelBridgeUrl, getExcelBridgePort, isExcelBridgeEnabled } from '../../config/env'
import type { ExcelSyncResult } from '../../types/api.types'

function bridgeUnavailableHint(): string {
  return `请确认 Excel Bridge 已启动（端口 ${getExcelBridgePort()}）且 Excel 工作簿已打开`
}

function bridgeNetworkMessage(err: unknown): string {
  const hint = bridgeUnavailableHint()
  const msg = err instanceof Error ? err.message : String(err)
  const code = err instanceof Error && 'code' in err ? String((err as NodeJS.ErrnoException).code) : ''
  if ((err instanceof Error && err.name === 'TimeoutError') || /timeout/i.test(msg)) {
    return `Excel Bridge 请求超时 (${getExcelBridgeUrl()})，${hint}`
  }
  if (code === 'ECONNREFUSED' || /ECONNREFUSED|fetch failed|Failed to fetch/i.test(msg)) {
    return `Excel Bridge 不可用 (${getExcelBridgeUrl()})，${hint}`
  }
  return `Excel Bridge 不可用: ${msg}`
}

async function readResponseBody(res: Response): Promise<{ parsed: unknown; text: string }> {
  const text = await res.text()
  try {
    return { parsed: JSON.parse(text), text }
  } catch {
    const preview = text.slice(0, 300)
    throw new Error(`Excel Bridge 返回非 JSON (HTTP ${res.status}): ${preview}`)
  }
}

function extractErrorMessage(body: Record<string, unknown>, status: number): string {
  const msg = body.message ?? body.error
  if (typeof msg === 'string' && msg.trim()) return msg
  const summary = JSON.stringify(body).slice(0, 300)
  return `HTTP ${status}: ${summary}`
}

async function callBridge(path: string, init?: RequestInit): Promise<ExcelSyncResult> {
  const url = `${getExcelBridgeUrl()}${path}`
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20000),
    })
    const { parsed, text } = await readResponseBody(res)
    const data = parsed as ExcelSyncResult & { message?: string; error?: string }

    if (!res.ok) {
      const body = typeof parsed === 'object' && parsed !== null
        ? parsed as Record<string, unknown>
        : { body: text.slice(0, 300) }
      throw new Error(`Excel Bridge 错误 (${res.status}): ${extractErrorMessage(body, res.status)}`)
    }

    const after = data.afterSnapshotBase64 ?? data.snapshotBase64
    return {
      ok: !!data.ok,
      message: data.message || (data.ok ? 'Excel 同步成功' : 'Excel 同步失败'),
      row: data.row,
      sheet: data.sheet,
      snapshotBase64: after,
      beforeSnapshotBase64: data.beforeSnapshotBase64,
      afterSnapshotBase64: after,
      syncedAt: data.syncedAt,
      verify: data.verify,
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Excel Bridge')) throw e
    throw new Error(bridgeNetworkMessage(e))
  }
}

async function fetchBridgeJson<T extends Record<string, unknown>>(
  path: string,
  init?: RequestInit,
  timeoutMs = 10000,
): Promise<{ res: Response; data: T }> {
  const url = `${getExcelBridgeUrl()}${path}`
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const { parsed, text } = await readResponseBody(res)
    const data = parsed as T
    if (!res.ok) {
      const body = typeof parsed === 'object' && parsed !== null
        ? parsed as Record<string, unknown>
        : { body: text.slice(0, 300) }
      throw new Error(`Excel Bridge 错误 (${res.status}): ${extractErrorMessage(body, res.status)}`)
    }
    return { res, data }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Excel Bridge')) throw e
    throw new Error(bridgeNetworkMessage(e))
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function syncUpdateRowToExcel(_payload: Record<string, unknown>): Promise<ExcelSyncResult> {
  return {
    ok: false,
    message: 'Excel 仅允许通过出库/入库修改，不支持直接改行',
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
    const { data: body } = await fetchBridgeJson<{ ok?: boolean; message?: string; data?: ExcelRowData }>(
      `/row/${encodeURIComponent(certNo)}${suffix}`,
    )
    if (!body.ok || !body.data?.certNo) {
      return { ok: false, message: body.message || `Excel 中未找到 ${certNo}` }
    }
    return { ok: true, message: body.message || '已从 Excel 读取', data: body.data }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
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
    const { data: body } = await fetchBridgeJson<{
      ok?: boolean
      message?: string
      certNo?: string
      nextNum?: number
      excelMax?: number
    }>(`/next-cert-no?${q}`)
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function checkExcelBridgeHealth(): Promise<{
  online: boolean
  message: string
  workbook?: string
  sheet?: string
}> {
  try {
    const { data } = await fetchBridgeJson<{
      ok?: boolean
      bound?: boolean
      workbook?: string
      sheet?: string
      message?: string
    }>('/health', undefined, 3000)
    if (!data.ok) return { online: false, message: data.message || '桥接异常' }
    if (data.bound && data.workbook) {
      return { online: true, message: `已绑定 ${data.workbook} / ${data.sheet || ''}`, workbook: data.workbook, sheet: data.sheet }
    }
    return { online: true, message: '在线，请打开 Excel 工作簿' }
  } catch (e) {
    return { online: false, message: e instanceof Error ? e.message : 'Excel 桥接服务离线' }
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
      const { data: refreshBody } = await fetchBridgeJson<{ ok?: boolean; message?: string }>(
        '/cert-index/refresh',
        { method: 'POST' },
        120000,
      )
      if (!refreshBody.ok) {
        return { ok: false, message: refreshBody.message || '刷新索引失败' }
      }
    }
    const { data: body } = await fetchBridgeJson<{
      ok?: boolean
      message?: string
      entries?: CertIndexEntry[]
      count?: number
      builtAt?: string | null
      workbook?: string
    }>('/cert-index', undefined, 120000)
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
