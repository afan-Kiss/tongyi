import type { ExcelSyncResult } from '../types/api.types'

/** 将 Excel 同步结果（含截图）序列化写入 operationLog.excelSyncMsg */
export function serializeExcelSyncMsg(excelSync: ExcelSyncResult): string {
  const after = excelSync.afterSnapshotBase64 ?? excelSync.snapshotBase64
  return JSON.stringify({
    ok: excelSync.ok,
    message: excelSync.message,
    row: excelSync.row,
    sheet: excelSync.sheet,
    beforeSnapshotBase64: excelSync.beforeSnapshotBase64,
    afterSnapshotBase64: after,
    snapshotBase64: after,
    syncedAt: excelSync.syncedAt ?? new Date().toISOString(),
    verify: excelSync.verify,
    hasSnapshot: !!(after || excelSync.beforeSnapshotBase64),
  })
}

/** 从 operationLog.excelSyncMsg 还原 Excel 同步结果（含截图） */
export function parseExcelSyncMsg(raw: string | null | undefined): ExcelSyncResult | null {
  if (!raw?.trim()) return null
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    if (obj.skipped) return null
    const after = (obj.afterSnapshotBase64 ?? obj.snapshotBase64) as string | undefined
    const before = obj.beforeSnapshotBase64 as string | undefined
    if (!after && !before) return null
    return {
      ok: obj.ok !== false,
      message: String(obj.message || ''),
      row: typeof obj.row === 'number' ? obj.row : undefined,
      sheet: typeof obj.sheet === 'string' ? obj.sheet : undefined,
      beforeSnapshotBase64: before,
      afterSnapshotBase64: after,
      snapshotBase64: after,
      syncedAt: typeof obj.syncedAt === 'string' ? obj.syncedAt : undefined,
      verify: obj.verify as Record<string, string> | undefined,
    }
  } catch {
    return null
  }
}
