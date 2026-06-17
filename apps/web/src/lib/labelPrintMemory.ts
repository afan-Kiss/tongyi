import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'

const STORAGE_KEY = 'jade-label-print-v1'
const LEGACY_BARCODE_KEY = 'jade-inbound-new-v1'

export interface LabelPrintMemory {
  /** 各行 format 文字（含条形码下方数字） */
  lineFormats: Record<string, string>
  /** 用户手改条形码后，批次/成本/圈口变化不再自动改条形码 */
  barcodeManual?: boolean
  /** 用户手改售价后，成本变化不再自动改售价 */
  priceManual?: boolean
}

function defaultLineFormats(): Record<string, string> {
  return Object.fromEntries(DEFAULT_LABEL_LINES.map((l) => [l.id, l.format]))
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) as Partial<T> }
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota */
  }
}

function migrateLegacyBarcode(formats: Record<string, string>): Record<string, string> {
  const barcode = formats.barcode?.trim() ?? ''
  if (barcode && barcode !== '[编号]' && barcode !== '{certNo}') return formats
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_BARCODE_KEY) || '{}') as {
      barcodeCaption?: string
    }
    const cap = legacy.barcodeCaption?.trim()
    if (cap && cap !== '[编号]' && cap !== '{certNo}') {
      return { ...formats, barcode: cap }
    }
  } catch {
    /* ignore */
  }
  return { ...formats, barcode: '' }
}

export function loadLabelPrintMemory(): LabelPrintMemory {
  const parsed = readJson<{ lineFormats?: Record<string, string>; barcodeManual?: boolean; priceManual?: boolean }>(STORAGE_KEY, {})
  let lineFormats = { ...defaultLineFormats(), ...(parsed.lineFormats ?? {}) }
  if (lineFormats.barcode === '[编号]' || lineFormats.barcode === '{certNo}') {
    lineFormats.barcode = ''
  }
  lineFormats = migrateLegacyBarcode(lineFormats)
  if (lineFormats.price === '售价元' || lineFormats.price === '售价:') {
    lineFormats.price = '售价:元'
  }
  if (lineFormats.price?.startsWith('售价') && !lineFormats.price.startsWith('售价:')) {
    lineFormats.price = lineFormats.price.replace(/^售价/, '售价:')
  }
  const barcode = lineFormats.barcode?.trim() ?? ''
  let barcodeManual = parsed.barcodeManual ?? false
  let migrated = false
  // 旧规则固定 03 前缀：清空并解除手改锁定，让表单按 02 规则重新生成
  if (barcode.startsWith('03') && /^\d+$/.test(barcode)) {
    lineFormats.barcode = ''
    barcodeManual = false
    migrated = true
  }
  const result = { lineFormats, barcodeManual, priceManual: parsed.priceManual ?? false }
  if (migrated) saveLabelPrintMemory(result)
  return result
}

/** 新建一条标签入库时的默认吊牌（不读上次编号/条形码） */
export function createDefaultLabelPrintMemory(): LabelPrintMemory {
  return { lineFormats: defaultLineFormats(), barcodeManual: false, priceManual: false }
}

export function saveLabelPrintMemory(mem: LabelPrintMemory): void {
  writeJson(STORAGE_KEY, mem)
}

export function setLabelLineFormat(id: string, format: string): LabelPrintMemory {
  const mem = loadLabelPrintMemory()
  const next = { ...mem, lineFormats: { ...mem.lineFormats, [id]: format } }
  saveLabelPrintMemory(next)
  return next
}

export function getBarcodeDigits(mem?: LabelPrintMemory): string {
  const m = mem ?? loadLabelPrintMemory()
  return m.lineFormats.barcode?.trim() ?? ''
}
