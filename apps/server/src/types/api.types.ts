/** 统一 API 契约 — 前后端共享的数据结构定义 */

export interface ApiSuccess<T> {
  ok: true
  data: T
  message?: string
}

export interface ApiError {
  ok: false
  message: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export interface ExcelSyncResult {
  ok: boolean
  message: string
  row?: number
  sheet?: string
  snapshotBase64?: string
  verify?: Record<string, string>
}

export interface OperationResult {
  bracelet: Record<string, unknown>
  logId: string
  excelSync?: ExcelSyncResult
  /** 数据库已更新但 Excel 未同步时为 true */
  partialSuccess?: boolean
  partialMessage?: string
}

export interface OutboundDto {
  certNo: string
  priceText: string
  remarkText?: string
  salesPerson?: string
  salesChannel?: string
  orderNo?: string
}

export interface InboundDto {
  certNo: string
  remarkText?: string
}

export interface NewBraceletDto {
  certNo: string
  arrivalDate?: string
  batch?: string
  category?: string
  ringSize?: string
  cost?: string
  remark?: string
  /** SQL 专有扩展详情，不同步 Excel */
  detail?: BraceletDetailDto
}

export interface BraceletDetailDto {
  description?: string
  material?: string
  jadeGrade?: string
  weightGram?: string
  origin?: string
  color?: string
  flawNotes?: string
  internalNote?: string
  tags?: string
  extraJson?: string
}
