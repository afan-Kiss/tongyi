import type { LabelTemplate } from '@/api/types'

import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'
import { loadLabelPrintMemory, saveLabelPrintMemory } from '@/lib/labelPrintMemory'

/** 内置吊牌参数（尺寸/字体等与 print-agent/label_format.py 一致） */
export const BUILTIN_LABEL_TEMPLATE: LabelTemplate = {
  id: 'builtin',
  widthMm: 25,
  heightMm: 70,
  barcodeType: 'CODE128',
  offsetTopMm: 0,
  offsetBottomMm: 0,
  offsetLeftMm: 0,
  offsetRightMm: 0,
  compactFeed: false,
  lines: [...DEFAULT_LABEL_LINES],
}

/** @deprecated 始终返回内置模板 */
export const DEFAULT_LABEL_TEMPLATE = BUILTIN_LABEL_TEMPLATE

export function loadLabelTemplate(): LabelTemplate {
  const mem = loadLabelPrintMemory()
  const lines = DEFAULT_LABEL_LINES.map((line) => ({
    ...line,
    format: mem.lineFormats[line.id] ?? line.format,
  }))
  return { ...BUILTIN_LABEL_TEMPLATE, lines }
}

export function saveLabelTemplate(template: LabelTemplate): void {
  const lineFormats = Object.fromEntries(
    template.lines.map((l) => [l.id, l.format]),
  )
  saveLabelPrintMemory({ lineFormats })
}

export function labelFieldSize(template: LabelTemplate, key: string, fallback: number): number {
  const line = template.lines.find((l) => l.id === key || (key === 'category' && l.id === 'title'))
  const size = line?.size ?? 0
  return size > 0 ? size : fallback
}

export function labelContentShift(_template: LabelTemplate): { xMm: number; yMm: number } {
  return { xMm: 0, yMm: 0 }
}
