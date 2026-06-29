type JsonRecord = Record<string, unknown>

export interface OperationLogPresented {
  id: string
  certNo: string
  opType: string
  opLabel: string
  detail: string
  createdAt: Date
  reverted: boolean
  excelSynced: boolean
  price?: string | null
  salesPerson?: string | null
  salesChannel?: string | null
  priorPrice?: string | null
  priorSoldDate?: string | null
  remarkHint?: string | null
  /** 关联小红书订单号（出库/退货入库时从快照解析） */
  orderNo?: string | null
  bracelet?: {
    id: string
    certNo: string
    category?: string | null
    batch?: string | null
    ringSize?: string | null
    cost?: string | null
  } | null
}

function parseJson(raw: string | null | undefined): JsonRecord | null {
  if (!raw?.trim()) return null
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as JsonRecord) : null
  } catch {
    return null
  }
}

function str(v: unknown): string {
  if (v == null || v === '') return ''
  return String(v).trim()
}

function fmtPrice(v: unknown): string {
  const s = str(v)
  if (!s) return ''
  const n = Number(s.replace(/,/g, ''))
  if (Number.isNaN(n)) return s
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

/** 从 Excel 备注片段推断说明（无 structured 售价时的兜底） */
function inferRemarkHint(remark: string): string {
  const text = remark.trim()
  if (!text) return ''
  const parts = text.split(/[；;]/).map((s) => s.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].includes('发出')) return parts[i]
  }
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (parts[i].includes('退回')) return parts[i]
  }
  return parts[parts.length - 1] || ''
}

function opLabel(opType: string): string {
  switch (opType) {
    case 'outbound':
      return '出库'
    case 'inbound':
      return '入库'
    case 'register':
      return '登记'
    case 'new_inbound':
      return '新品入库'
    case 'update':
      return '编辑'
    default:
      return '操作'
  }
}

function summarizeOutbound(snap: JsonRecord | null, result: JsonRecord | null) {
  const price = fmtPrice(result?.actualPrice) || fmtPrice(snap?.actualPrice)
  const salesPerson = str(result?.salesPerson) || str(snap?.salesPerson)
  const salesChannel = str(result?.salesChannel) || str(snap?.salesChannel)
  const parts: string[] = []
  if (price) parts.push(`售价 ¥${price}`)
  if (salesPerson) parts.push(salesPerson)
  if (salesChannel) parts.push(salesChannel)
  return {
    price: price || null,
    salesPerson: salesPerson || null,
    salesChannel: salesChannel || null,
    detail: parts.length ? parts.join(' · ') : '出库',
  }
}

function summarizeInbound(snap: JsonRecord | null) {
  const priorPrice = fmtPrice(snap?.actualPrice)
  const priorSoldDate = str(snap?.soldDate)
  const remarkHint = inferRemarkHint(str(snap?.remark))
  const parts: string[] = []
  if (priorPrice) {
    parts.push(`此前售价 ¥${priorPrice}`)
  } else if (remarkHint) {
    parts.push(remarkHint)
  }
  if (priorSoldDate) parts.push(`售出 ${priorSoldDate}`)
  return {
    priorPrice: priorPrice || null,
    priorSoldDate: priorSoldDate || null,
    remarkHint: remarkHint || null,
    detail: parts.length ? parts.join(' · ') : '入库',
  }
}

type RawLog = {
  id: string
  certNo: string
  opType: string
  snapshotJson: string
  resultJson: string | null
  createdAt: Date
  reverted: boolean
  excelSynced: boolean
  bracelet?: {
    id: string
    certNo: string
    category?: string | null
    batch?: string | null
    ringSize?: string | null
    cost?: string | null
  } | null
}

function parseOrderNoFromText(text: string): string | null {
  const s = text.trim()
  if (!s) return null
  const m = s.match(/\b(P\d{10,})\b/i)
  return m ? m[1].toUpperCase() : null
}

function extractOrderNo(snap: JsonRecord | null, result: JsonRecord | null, opType: string): string | null {
  const fromResult = str(result?.orderNo)
  const fromSnap = str(snap?.orderNo)
  const fromRemark =
    parseOrderNoFromText(str(snap?.remark)) || parseOrderNoFromText(str(result?.remark))
  if (opType === 'outbound') return fromResult || fromSnap || fromRemark || null
  if (opType === 'inbound') return fromSnap || fromResult || fromRemark || null
  return fromResult || fromSnap || fromRemark || null
}

export function presentOperationLog(log: RawLog): OperationLogPresented {
  const snap = parseJson(log.snapshotJson)
  const result = parseJson(log.resultJson)
  const label = opLabel(log.opType)

  let detail = label
  let price: string | null | undefined
  let salesPerson: string | null | undefined
  let salesChannel: string | null | undefined
  let priorPrice: string | null | undefined
  let priorSoldDate: string | null | undefined
  let remarkHint: string | null | undefined

  if (log.opType === 'outbound') {
    const s = summarizeOutbound(snap, result)
    detail = s.detail
    price = s.price
    salesPerson = s.salesPerson
    salesChannel = s.salesChannel
  } else if (log.opType === 'inbound') {
    const s = summarizeInbound(snap)
    detail = s.detail
    priorPrice = s.priorPrice
    priorSoldDate = s.priorSoldDate
    remarkHint = s.remarkHint
  } else if (log.opType === 'register' || log.opType === 'new_inbound') {
    const batch = str(result?.batch) || str(snap?.batch)
    const category = str(result?.category) || str(snap?.category)
    const parts: string[] = []
    if (category) parts.push(category)
    if (batch) parts.push(`批次 ${batch}`)
    detail = parts.length ? parts.join(' · ') : label
  }

  if (log.reverted) detail = `${detail}（已撤销）`

  const orderNo = extractOrderNo(snap, result, log.opType)

  return {
    id: log.id,
    certNo: log.certNo,
    opType: log.opType,
    opLabel: label,
    detail,
    createdAt: log.createdAt,
    reverted: log.reverted,
    excelSynced: log.excelSynced,
    price,
    salesPerson,
    salesChannel,
    priorPrice,
    priorSoldDate,
    remarkHint,
    orderNo,
    bracelet: log.bracelet
      ? {
          id: log.bracelet.id,
          certNo: log.bracelet.certNo,
          category: log.bracelet.category,
          batch: log.bracelet.batch,
          ringSize: log.bracelet.ringSize,
          cost: log.bracelet.cost,
        }
      : null,
  }
}

export function presentOperationLogs(logs: RawLog[]): OperationLogPresented[] {
  return logs.map(presentOperationLog)
}
