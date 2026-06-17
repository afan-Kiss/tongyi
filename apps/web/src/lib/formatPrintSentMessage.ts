import type { Bracelet } from '@/api/types'
import { fillLabelLinesFromBracelet } from '@/lib/labelPrintSync'
import { loadLabelPrintMemory, type LabelPrintMemory } from '@/lib/labelPrintMemory'

function excelRegisterHint(excelSync?: { message?: string; row?: number } | null): string | null {
  if (excelSync?.row) return `已关联 Excel 第 ${excelSync.row} 行，未修改 Excel`
  const message = excelSync?.message?.trim()
  if (!message) return null
  const inner = message.match(/[（(]([^）)]+)[）)]/)?.[1]?.trim()
  if (inner?.includes('Excel')) return inner
  if (message.includes('未修改 Excel')) return '未修改 Excel'
  return null
}

function printSummary(bracelet: Bracelet, labelMemory?: LabelPrintMemory): string {
  const mem = labelMemory ?? fillLabelLinesFromBracelet(loadLabelPrintMemory(), bracelet)
  const cert = (mem.lineFormats.cert?.replace(/^编号:/, '') || bracelet.certNo).trim()
  const ring = (mem.lineFormats.ring?.replace(/^圈口:/, '') || bracelet.ringSize || '—').trim()
  let price = (mem.lineFormats.price || bracelet.labelPrice || '—').trim()
  if (price.startsWith('售价:')) price = price.slice(3).trim()
  return `已打印  ${cert}  ${ring}  ${price}`
}

/** 「打印已发送」提示框文案 */
export function formatPrintSentMessage(opts: {
  bracelet: Bracelet
  labelMemory?: LabelPrintMemory
  excelSync?: { message?: string; row?: number } | null
}): string {
  const printPart = printSummary(opts.bracelet, opts.labelMemory)
  const excelPart = excelRegisterHint(opts.excelSync)
  return excelPart ? `${excelPart} · ${printPart}` : printPart
}
