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
  /** 面向用户的处理步骤（打印故障等） */
  solutions?: string[]
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export interface ExcelSyncResult {
  ok: boolean
  message: string
  row?: number
  sheet?: string
  /** @deprecated 与 afterSnapshotBase64 相同，保留兼容 */
  snapshotBase64?: string
  beforeSnapshotBase64?: string
  afterSnapshotBase64?: string
  /** 打开详情时实时截取的 Excel 行现状 */
  currentSnapshotBase64?: string
  currentSyncedAt?: string
  /** 现状截图失败时的原因（仍有改前/改后时可一并返回） */
  currentSnapshotError?: string
  /** 现状截图来自本地缓存（非实时截取） */
  currentFromCache?: boolean
  syncedAt?: string
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
  /** 吊牌条形码内容（扫码识别用，可与 certNo 不同） */
  barcodeValue?: string
  /** 吊牌「售价」行文字（如 售价:9000元） */
  labelPrice?: string
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
