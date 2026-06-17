import type { LabelTemplate } from '@/api/types'
import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'
import { loadLabelPrintMemory, type LabelPrintMemory } from '@/lib/labelPrintMemory'
import { BUILTIN_LABEL_TEMPLATE } from '@/lib/labelTemplateStorage'

/** 从记忆构建打印模板（各行文字 + 条形码数字） */
export function buildPrintTemplate(memory?: LabelPrintMemory): LabelTemplate {
  const mem = memory ?? loadLabelPrintMemory()
  const lines = DEFAULT_LABEL_LINES.map((line) => ({
    ...line,
    format: mem.lineFormats[line.id] ?? line.format,
  }))
  return { ...BUILTIN_LABEL_TEMPLATE, lines }
}
