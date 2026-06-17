export interface Bracelet {
  id: string
  certNo: string
  /** 吊牌条形码内容（扫码识别） */
  barcodeValue?: string | null
  arrivalDate?: string | null
  batch?: string | null
  qty: number
  category?: string | null
  ringSize?: string | null
  cost?: string | null
  /** 吊牌「售价」行（登记时写入，如 售价:9000元） */
  labelPrice?: string | null
  remark?: string | null
  orderNo?: string | null
  returnDate?: string | null
  soldDate?: string | null
  actualPrice?: string | null
  salesPerson?: string | null
  salesChannel?: string | null
  detail?: BraceletDetail | null
  mediaAssets?: MediaAsset[]
  _count?: { mediaAssets: number }
  /** 系统登记/添加时间 */
  createdAt?: string | null
}

/** SQL 专有扩展详情（不进 Excel） */
export interface BraceletDetail {
  id: string
  braceletId: string
  description?: string | null
  material?: string | null
  jadeGrade?: string | null
  weightGram?: string | null
  origin?: string | null
  color?: string | null
  flawNotes?: string | null
  internalNote?: string | null
  tags?: string | null
  extraJson?: string | null
}

export interface MediaAsset {
  id: string
  type: string
  path: string
  thumbPath?: string | null
  mimeType?: string | null
  url?: string
  thumbUrl?: string | null
}

export interface OperationLog {
  id: string
  certNo: string
  opType: string
  createdAt: string
  reverted: boolean
  excelSynced: boolean
  bracelet?: Bracelet
}

export interface DashboardStats {
  inStock: number
  outOfStock: number
  todayOutbound: number
  todayInbound: number
  recentLogs: OperationLog[]
}

export interface ListResult {
  items: Bracelet[]
  total: number
  page: number
  pageSize: number
}

export interface OutboundBody {
  certNo: string
  priceText: string
  remarkText?: string
  salesPerson?: string
  salesChannel?: string
  orderNo?: string
}

export interface InboundBody {
  certNo: string
  remarkText?: string
}

export interface NewBraceletBody {
  certNo: string
  arrivalDate?: string
  batch?: string
  category?: string
  ringSize?: string
  cost?: string
  remark?: string
  detail?: Partial<BraceletDetail>
  /** 吊牌条形码内容，登记时写入供扫码查询 */
  barcodeValue?: string
  /** 吊牌「售价」行文字，与成本/实际售价无关 */
  labelPrice?: string
}

/** Excel 行只读预览（标签入库预填） */
export interface ExcelRowPreview {
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

export interface AppSettings {
  excelBridgeEnabled: boolean
  publicUrl: string
  lanUrls: string[]
  defaultSalesPerson: string
  defaultSalesChannel: string
  printerName?: string
  printerModel?: string
}

export interface SystemStatus {
  lanIps: string[]
  port: number
  /** 手机拍照 HTTPS 端口，0 表示未启用 */
  mobileHttpsPort?: number
  xiangyuPort: number
  xiangyuWebUrl: string
  xiangyuProxyPath: string
  degraded: boolean
  degradedReasons: string[]
  xiangyu: { online: boolean; message: string; bridge: { online: boolean; message: string } }
  excelBridge: { online: boolean; message: string }
  printAgent: { online: boolean; message: string }
}

export type LabelFontFamily = 'msyh' | 'simhei' | 'simsun' | 'simkai' | 'fangsong'

export interface LabelLine {
  id: string
  kind: 'barcode' | 'text'
  name: string
  /** 支持 [编号] 等占位符；方括号段 [编号:xxx] 在占位符为空时整段省略 */
  format: string
  show: boolean
  size: number
  /** 字体：msyh=微软雅黑 simhei=黑体 simsun=宋体 simkai=楷体 fangsong=仿宋 */
  fontFamily?: LabelFontFamily
  bold?: boolean
  /** 203dpi 竖版 25×70mm 画布(560px)上的固定 Y，与璞趣官方模板一致 */
  yPx?: number
  /** 文字/条码行级微调（像素） */
  offsetXPx?: number
  offsetYPx?: number
  /** 条码左对齐锚点（不设则居中） */
  xPx?: number
  /** 条码目标高度（px，默认 51） */
  barcodeHeight?: number
  /** 条码水平拉长倍数（左锚点不变，向右延伸） */
  barcodeStretchX?: number
  /** 条码下方编号与条码间距（px） */
  captionGapPx?: number
  /** 文字对齐，默认居中 */
  textAlign?: 'left' | 'center'
}

export interface LabelTemplate {
  id: string
  widthMm: number
  heightMm: number
  barcodeType: string
  offsetTopMm?: number
  offsetBottomMm?: number
  offsetLeftMm?: number
  offsetRightMm?: number
  /** 紧凑走纸：裁掉下方空白，避免璞趣标签纸设成 25×25 时走纸 3 次 */
  compactFeed?: boolean
  lines: LabelLine[]
  /** @deprecated 已由 lines 替代，加载时自动迁移 */
  fields?: { key: string; label: string; show: boolean; size: number }[]
}

export interface ExcelSyncResult {
  ok: boolean
  message: string
  row?: number
  sheet?: string
  /** @deprecated 与 afterSnapshotBase64 相同，保留兼容 */
  snapshotBase64?: string
  beforeSnapshotBase64?: string
  afterSnapshotBase64?: string
  syncedAt?: string
  verify?: Record<string, string>
}

export interface OpResult {
  bracelet: Bracelet
  logId: string
  excelSync?: ExcelSyncResult
  partialSuccess?: boolean
  partialMessage?: string
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

export interface CertIndexStatus {
  ready: boolean
  loading: boolean
  count: number
  builtAt: string | null
  workbook: string | null
  message: string
}
