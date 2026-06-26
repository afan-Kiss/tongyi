/** 机器可读标记，写入 operationLog.excelSyncMsg 前缀，供 pending 过滤 */
export const STALE_RETRY_SKIPPED_MARKER = '[STALE_RETRY_SKIPPED]'
export const MANUAL_REVIEW_REQUIRED_MARKER = '[MANUAL_REVIEW_REQUIRED]'

export const STALE_EXCEL_RETRY_MSG = '当前库存状态已变化，已跳过旧 Excel 重试，请人工核对'
export const MANUAL_EXCEL_REVIEW_MSG = '缺少操作结果快照或解析失败，需人工核对后再同步 Excel'

export function taggedExcelRetryMessage(marker: string, humanMessage: string): string {
  return `${marker}${humanMessage}`
}
