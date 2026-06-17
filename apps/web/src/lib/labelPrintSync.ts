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

/** 编号、圈口、售价行随上方表单自动填入 */
export function applyFormSyncToLabelMemory(
  memory: LabelPrintMemory,
  form: { certNo?: string | null; ringSize?: string | null; cost?: string | null },
): LabelPrintMemory {
  const lineFormats = { ...memory.lineFormats }
  const certNo = form.certNo?.trim().toUpperCase()
  if (certNo) {
    lineFormats.cert = `编号:${certNo}`
  }
  const ring = formatRingSizeForLabel(form.ringSize)
  if (ring) {
    lineFormats.ring = `圈口:${ring}`
  }
  const cost = form.cost?.trim()
  if (cost) {
    lineFormats.price = formatPriceForLabel(cost)
  }
  return { lineFormats }
}
