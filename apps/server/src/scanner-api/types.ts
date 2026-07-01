/** 本地 Worker / 记账系统读取的统一镯子格式 */
export type ScannerBraceletStatus = 'in_stock' | 'out_of_stock'

export interface ScannerBraceletDto {
  scannerProductId: string
  braceletCode: string
  barcodeValue: string
  certificateNo: string
  imagePath: string | null
  thumbPath: string | null
  inboundAt: string | null
  inboundCost: number | null
  status: ScannerBraceletStatus
  raw: Record<string, unknown>
}

export interface ScannerApiSuccess<T> {
  success: true
  data: T
}

export interface ScannerApiFailure {
  success: false
  code: string
  message: string
}

export type ScannerApiResponse<T> = ScannerApiSuccess<T> | ScannerApiFailure
