import type { LabelPrintMemory } from '@/lib/labelPrintMemory'
import { normalizeBarcodePrefix } from '@/lib/labelPrintMemory'
import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'

/** 圈口打印保留一位小数 */
export function formatRingSizeForLabel(raw: string | null | undefined): string {
  const s = raw?.trim() ?? ''
  if (!s) return ''
  const n = Number(s)
  if (!Number.isNaN(n)) return n.toFixed(1)
  return s
}

export function formatPriceForLabel(raw: string | null | undefined): string {
  const s = raw?.trim() ?? ''
  if (!s) return ''
  const n = Number(s.replace(/,/g, ''))
  const body = Number.isNaN(n) ? s : String(n)
  if (body.startsWith('售价:')) return body.endsWith('元') ? body : `${body}元`
  if (body.startsWith('售价')) return body.replace(/^售价/, '售价:').replace(/元?$/, '元')
  return `售价:${body}元`
}

/** 吊牌售价 = 成本 × 3 */
export function computeLabelPriceFromCost(cost: string | null | undefined): string | null {
  const costN = parseNumber(cost)
  if (costN === null) return null
  return String(Math.round(costN * 3))
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
 * 条形码：前缀 + (成本×3+10) + 圈口整数（拼接，非相加）
 * 例：前缀 02、成本 1000、圈口 57 → 02301057
 */
export function computeBarcodeDigits(
  cost: string | null | undefined,
  ringSize: string | null | undefined,
  prefix?: string | null,
): string | null {
  const costN = parseNumber(cost)
  const ringN = parseRingInteger(ringSize)
  if (costN === null || ringN === null) return null
  const middle = Math.round(costN * 3 + 10)
  const pre = normalizeBarcodePrefix(prefix)
  return `${pre}${middle}${ringN}`
}

export type LabelFormSync = {
  certNo?: string | null
  ringSize?: string | null
  cost?: string | null
  batch?: string | null
  labelPrice?: string | null
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
    labelPrice?: string | null
  },
): LabelPrintMemory {
  const lineFormats = { ...memory.lineFormats }
  const defaultWarning = DEFAULT_LABEL_LINES.find((l) => l.id === 'warning')?.format
  if (defaultWarning && !lineFormats.warning?.trim()) lineFormats.warning = defaultWarning
  const defaultTitle = DEFAULT_LABEL_LINES.find((l) => l.id === 'title')?.format
  if (defaultTitle) lineFormats.title = defaultTitle
  const certNo = bracelet.certNo?.trim().toUpperCase()
  if (certNo) lineFormats.cert = `编号:${certNo}`
  const ring = formatRingSizeForLabel(bracelet.ringSize)
  if (ring) lineFormats.ring = `圈口:${ring}`
  const labelPrice = bracelet.labelPrice?.trim()
  if (labelPrice) {
    lineFormats.price = labelPrice
  } else {
    const priceDigits = computeLabelPriceFromCost(bracelet.cost)
    if (priceDigits) {
      lineFormats.price = formatPriceForLabel(priceDigits)
    } else {
      const defaultPrice = DEFAULT_LABEL_LINES.find((l) => l.id === 'price')?.format
      if (defaultPrice) lineFormats.price = defaultPrice
    }
  }

  const stored = bracelet.barcodeValue?.trim()
  const computed = computeBarcodeDigits(bracelet.cost, bracelet.ringSize, memory.barcodePrefix)
  const barcode =
    (stored && !(stored.startsWith('03') && /^\d+$/.test(stored)) ? stored : null) ||
    computed ||
    stored ||
    ''
  if (barcode) lineFormats.barcode = barcode

  return { ...memory, lineFormats }
}

/** 用表单填充吊牌各行（编号/圈口/售价/条形码） */
export function fillLabelLinesFromForm(
  memory: LabelPrintMemory,
  form: LabelFormSync,
  opts?: { overwriteBarcode?: boolean; overwritePrice?: boolean },
): LabelPrintMemory {
  const lineFormats = { ...memory.lineFormats }
  const certNo = form.certNo?.trim().toUpperCase()
  if (certNo) lineFormats.cert = `编号:${certNo}`
  const ring = formatRingSizeForLabel(form.ringSize)
  if (ring) lineFormats.ring = `圈口:${ring}`

  const shouldPrice = opts?.overwritePrice || !memory.priceManual
  if (shouldPrice) {
    const labelPrice = form.labelPrice?.trim()
    if (labelPrice) {
      lineFormats.price = labelPrice
    } else {
      const priceDigits = computeLabelPriceFromCost(form.cost)
      if (priceDigits) lineFormats.price = formatPriceForLabel(priceDigits)
    }
  }

  const shouldBarcode = opts?.overwriteBarcode || !memory.barcodeManual
  if (shouldBarcode) {
    const barcode = computeBarcodeDigits(form.cost, form.ringSize, memory.barcodePrefix)
    if (barcode) lineFormats.barcode = barcode
  } else {
    const prev = lineFormats.barcode?.trim() ?? ''
    const barcode = computeBarcodeDigits(form.cost, form.ringSize, memory.barcodePrefix)
    if (barcode && prev.startsWith('03') && /^\d+$/.test(prev)) {
      lineFormats.barcode = barcode
    }
  }

  return { ...memory, lineFormats }
}

/** @deprecated 请用 fillLabelLinesFromForm；打印以编辑框内容为准，不再在打印时覆盖 */
export function applyFormSyncToLabelMemory(memory: LabelPrintMemory, form: LabelFormSync): LabelPrintMemory {
  return fillLabelLinesFromForm(memory, form, { overwriteBarcode: false })
}
