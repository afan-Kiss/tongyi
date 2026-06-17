import type { LabelPrintMemory } from '@/lib/labelPrintMemory'

/** 圈口打印保留一位小数 */
export function formatRingSizeForLabel(raw: string | null | undefined): string {
  const s = raw?.trim() ?? ''
  if (!s) return ''
  const n = Number(s)
  if (!Number.isNaN(n)) return n.toFixed(1)
  return s
}

function formatPriceForLabel(raw: string | null | undefined): string {
  const s = raw?.trim() ?? ''
  if (!s) return ''
  const n = Number(s.replace(/,/g, ''))
  const body = Number.isNaN(n) ? s : String(n)
  if (body.startsWith('售价:')) return body.endsWith('元') ? body : `${body}元`
  if (body.startsWith('售价')) return body.replace(/^售价/, '售价:').replace(/元?$/, '元')
  return `售价:${body}元`
}

function parseNumber(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim().replace(/,/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

/** 批次前两位，如 2.0 → 02 */
export function parseBatchPrefix(batch: string | null | undefined): string {
  const s = (batch ?? '').trim()
  if (!s) return '00'
  const n = parseNumber(s)
  if (n !== null) {
    const int = Math.floor(n)
    return String(int).padStart(2, '0').slice(-2)
  }
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 2) return digits.slice(0, 2)
  if (digits.length === 1) return digits.padStart(2, '0')
  return '00'
}

/** 圈口取整数部分参与条形码，如 57.0 → 57 */
export function parseRingInteger(raw: string | null | undefined): number | null {
  const n = parseNumber(raw)
  if (n === null) return null
  return Math.floor(n)
}

/**
 * 条形码：03 + (成本×3+10) + 圈口整数（拼接，非相加）
 * 例：成本1000、圈口57 → 03301057
 */
export function computeBarcodeDigits(
  batch: string | null | undefined,
  cost: string | null | undefined,
  ringSize: string | null | undefined,
): string | null {
  const costN = parseNumber(cost)
  const ringN = parseRingInteger(ringSize)
  if (costN === null || ringN === null) return null
  const middle = Math.round(costN * 3 + 10)
  return `03${middle}${ringN}`
}

export type LabelFormSync = {
  certNo?: string | null
  ringSize?: string | null
  cost?: string | null
  batch?: string | null
}

/** 从库存记录填充吊牌各行（查询/抽屉重打，不用 localStorage 里上一件的条形码） */
export function fillLabelLinesFromBracelet(
  memory: LabelPrintMemory,
  bracelet: {
    certNo?: string | null
    ringSize?: string | null
    cost?: string | null
    batch?: string | null
    barcodeValue?: string | null
    category?: string | null
  },
): LabelPrintMemory {
  const lineFormats = { ...memory.lineFormats }
  const certNo = bracelet.certNo?.trim().toUpperCase()
  if (certNo) lineFormats.cert = `编号:${certNo}`
  const ring = formatRingSizeForLabel(bracelet.ringSize)
  if (ring) lineFormats.ring = `圈口:${ring}`
  const cost = bracelet.cost?.trim()
  if (cost) lineFormats.price = formatPriceForLabel(cost)
  const category = bracelet.category?.trim()
  if (category) lineFormats.title = category

  const barcode =
    bracelet.barcodeValue?.trim() ||
    computeBarcodeDigits(bracelet.batch, bracelet.cost, bracelet.ringSize) ||
    ''
  if (barcode) lineFormats.barcode = barcode

  return { ...memory, lineFormats }
}

/** 用表单填充吊牌各行（编号/圈口/售价/条形码） */
export function fillLabelLinesFromForm(
  memory: LabelPrintMemory,
  form: LabelFormSync,
  opts?: { overwriteBarcode?: boolean },
): LabelPrintMemory {
  const lineFormats = { ...memory.lineFormats }
  const certNo = form.certNo?.trim().toUpperCase()
  if (certNo) lineFormats.cert = `编号:${certNo}`
  const ring = formatRingSizeForLabel(form.ringSize)
  if (ring) lineFormats.ring = `圈口:${ring}`
  const cost = form.cost?.trim()
  if (cost) lineFormats.price = formatPriceForLabel(cost)

  const shouldBarcode = opts?.overwriteBarcode || !memory.barcodeManual
  if (shouldBarcode) {
    const barcode = computeBarcodeDigits(form.batch, form.cost, form.ringSize)
    if (barcode) lineFormats.barcode = barcode
  }

  return { ...memory, lineFormats }
}

/** @deprecated 请用 fillLabelLinesFromForm；打印以编辑框内容为准，不再在打印时覆盖 */
export function applyFormSyncToLabelMemory(memory: LabelPrintMemory, form: LabelFormSync): LabelPrintMemory {
  return fillLabelLinesFromForm(memory, form, { overwriteBarcode: false })
}
