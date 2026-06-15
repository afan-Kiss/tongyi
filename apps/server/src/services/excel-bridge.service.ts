import { getExcelBridgeUrl, isExcelBridgeEnabled } from '../config/env'

export interface ExcelSyncResult {
  ok: boolean
  message: string
  row?: number
  sheet?: string
  snapshotBase64?: string
  verify?: Record<string, string>
}

export async function syncToExcelBridge(
  opType: string,
  payload: Record<string, unknown>,
): Promise<ExcelSyncResult> {
  if (!isExcelBridgeEnabled()) {
    return { ok: false, message: 'Excel 桥接未启用（请在设置中开启）' }
  }
  try {
    const res = await fetch(`${getExcelBridgeUrl()}/sync/${opType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    })
    const data = (await res.json()) as ExcelSyncResult & { ok?: boolean }
    return {
      ok: !!data.ok,
      message: data.message || (data.ok ? 'Excel 同步成功' : 'Excel 同步失败'),
      row: data.row,
      sheet: data.sheet,
      snapshotBase64: data.snapshotBase64,
      verify: data.verify,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `桥接服务不可用: ${msg}` }
  }
}

export async function fetchExcelSnapshot(certNo: string): Promise<ExcelSyncResult> {
  try {
    const res = await fetch(
      `${getExcelBridgeUrl()}/snapshot/${encodeURIComponent(certNo)}`,
      { signal: AbortSignal.timeout(15000) },
    )
    const data = (await res.json()) as ExcelSyncResult
    return data
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg }
  }
}

export async function checkExcelBridgeHealth(): Promise<{
  online: boolean
  message: string
  workbook?: string
  sheet?: string
}> {
  try {
    const res = await fetch(`${getExcelBridgeUrl()}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    const data = (await res.json()) as {
      ok?: boolean
      bound?: boolean
      workbook?: string
      sheet?: string
      message?: string
    }
    if (!data.ok) {
      return { online: false, message: data.message || '桥接异常' }
    }
    if (data.bound && data.workbook) {
      return {
        online: true,
        message: `已绑定 ${data.workbook} / ${data.sheet || ''}`,
        workbook: data.workbook,
        sheet: data.sheet,
      }
    }
    return { online: true, message: '在线，请先打开 Excel 并绑定工作簿' }
  } catch {
    return { online: false, message: '桥接服务离线（请确认 excel-bridge 已启动）' }
  }
}
