import type { LabelTemplate } from '@/api/types'
import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'
import { BUILTIN_LABEL_TEMPLATE } from '@/lib/labelTemplateStorage'

/** 构建打印模板，可覆盖条形码下方文字 */
export function buildPrintTemplate(barcodeCaption?: string): LabelTemplate {
  const caption = barcodeCaption?.trim() || '{certNo}'
  const lines = DEFAULT_LABEL_LINES.map((line) =>
    line.id === 'barcode' ? { ...line, format: caption } : line,
  )
  return { ...BUILTIN_LABEL_TEMPLATE, lines }
}
