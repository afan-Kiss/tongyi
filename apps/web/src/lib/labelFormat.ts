import type { Bracelet, LabelFontFamily, LabelLine } from '@/api/types'

import { braceletLabelValue } from '@/lib/braceletLabel'

export const LABEL_FONT_OPTIONS: { id: LabelFontFamily; label: string; css: string }[] = [
  { id: 'msyh', label: '微软雅黑', css: '"Microsoft YaHei", sans-serif' },
  { id: 'simhei', label: '黑体', css: 'SimHei, sans-serif' },
  { id: 'simsun', label: '宋体', css: 'SimSun, serif' },
  { id: 'simkai', label: '楷体', css: 'KaiTi, serif' },
  { id: 'fangsong', label: '仿宋', css: 'FangSong, serif' },
]

export const LABEL_PLACEHOLDERS = [
  { key: 'certNo', label: '编号' },
  { key: 'category', label: '标题/品类' },
  { key: 'ringSize', label: '圈口' },
  { key: 'weightGram', label: '克重' },
  { key: 'price', label: '售价' },
  { key: 'batch', label: '批次' },
  { key: 'cost', label: '成本' },
  { key: 'remark', label: '备注' },
] as const

const BRACKET_LABEL_KEYS: Record<string, string> = Object.fromEntries(
  LABEL_PLACEHOLDERS.map((p) => [p.label, p.key]),
)

/** 将 [编号]、[圈口] 等中文占位符替换为实际值（与可选段 [编号:{certNo}] 不冲突） */
function expandBracketLabelPlaceholders(fmt: string, data: Record<string, string>): string {
  return fmt.replace(/\[([^\]]+)\]/g, (match, inner: string) => {
    const key = BRACKET_LABEL_KEYS[inner]
    if (!key) return match
    return data[key]?.trim() ?? ''
  })
}

/** 从手镯数据构建占位符字典（打印/预览共用） */
export function buildLabelData(bracelet: Bracelet): Record<string, string> {
  const category = bracelet.category?.trim() || '天然和田玉手镯'
  return {
    certNo: bracelet.certNo.trim().toUpperCase(),
    category,
    title: category,
    ringSize: braceletLabelValue(bracelet, 'ringSize').trim(),
    weightGram: braceletLabelValue(bracelet, 'weightGram').trim(),
    price: braceletLabelValue(bracelet, 'price').trim(),
    batch: braceletLabelValue(bracelet, 'batch').trim(),
    cost: braceletLabelValue(bracelet, 'cost').trim(),
    remark: braceletLabelValue(bracelet, 'remark').trim(),
  }
}

/** 渲染单行格式；`[...]` 内任占位符为空则整段省略 */
export function renderLabelFormat(format: string, data: Record<string, string>): string | null {
  const fmt = expandBracketLabelPlaceholders(format.trim(), data)
  if (!fmt) return null

  if (fmt.includes('[')) {
    let out = fmt.replace(/\[([^\]]+)\]/g, (_, block: string) => {
      const keys = [...block.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
      if (keys.some((k) => !data[k]?.trim())) return ''
      let seg = block
      for (const k of keys) seg = seg.replace(`{${k}}`, data[k].trim())
      return seg
    })
    out = out.replace(/\{(\w+)\}/g, (_, k: string) => data[k]?.trim() ?? '')
    out = out.replace(/\s+/g, ' ').trim()
    return out || null
  }

  const keys = [...fmt.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
  if (keys.length === 0) return fmt
  if (keys.some((k) => !data[k]?.trim())) return null
  let out = fmt
  for (const k of keys) out = out.replace(`{${k}}`, data[k].trim())
  return out.trim() || null
}

export function normalizeLabelLine(line: LabelLine): LabelLine {
  return {
    ...line,
    fontFamily: line.fontFamily || 'msyh',
    bold: line.bold ?? false,
    offsetXPx: line.offsetXPx ?? 0,
    offsetYPx: line.offsetYPx ?? 0,
  }
}

export function lineFontCss(line: LabelLine): {
  fontSize: string
  fontWeight: number
  fontFamily: string
} {
  const opt =
    LABEL_FONT_OPTIONS.find((f) => f.id === (line.fontFamily || 'msyh')) ?? LABEL_FONT_OPTIONS[0]
  return {
    fontSize: `${line.size}px`,
    fontWeight: line.bold ? 700 : 400,
    fontFamily: opt.css,
  }
}

export function lineFontStyleAttr(line: LabelLine): string {
  const css = lineFontCss(line)
  return `font-size:${css.fontSize};font-weight:${css.fontWeight};font-family:${css.fontFamily}`
}

export function resolveTextLines(
  lines: LabelLine[] | undefined,
  data: Record<string, string>,
): Array<{ line: LabelLine; text: string }> {
  const source = lines?.length ? lines : DEFAULT_LABEL_LINES
  const result: Array<{ line: LabelLine; text: string }> = []
  for (const line of source) {
    if (!line.show || line.kind !== 'text') continue
    const text = renderLabelFormat(line.format, data)
    if (text) result.push({ line, text })
  }
  return result
}

export function barcodeCaption(
  line: LabelLine | undefined,
  data: Record<string, string>,
): string | null {
  if (!line?.show) return null
  const fmt = line.format?.trim() ?? ''
  if (!fmt) return null
  return renderLabelFormat(fmt, data) ?? fmt
}

/** 预览/打印：直接使用 format 文字，不做占位符替换 */
export function resolveLiteralTextLines(
  lines: LabelLine[] | undefined,
): Array<{ line: LabelLine; text: string }> {
  const source = lines?.length ? lines : DEFAULT_LABEL_LINES
  const result: Array<{ line: LabelLine; text: string }> = []
  for (const line of source) {
    if (!line.show || line.kind !== 'text') continue
    const text = line.format?.trim() ?? ''
    if (text) result.push({ line, text })
  }
  return result
}

/** 条形码编码与下方文字：取 format 原文 */
export function literalBarcodeContent(line: LabelLine | undefined): string {
  if (!line?.show) return ''
  return line.format?.trim() ?? ''
}

/** 璞趣 25×70mm @203dpi 画布尺寸，与 print-agent label_png 一致 */
export const LABEL_CANVAS_REF_W = 200
export const LABEL_CANVAS_REF_H = 560

/** 来自桌面 测试.har 官方 PrintImage 布局（黑体） */
export const DEFAULT_LABEL_LINES: LabelLine[] = [
  {
    id: 'warning',
    kind: 'text',
    name: '退换提示',
    format: '标签撕毁 不予退换',
    show: true,
    size: 17,
    fontFamily: 'simhei',
    bold: true,
    yPx: 13,
    offsetXPx: 2,
  },
  {
    id: 'barcode',
    kind: 'barcode',
    name: '条形码',
    format: '',
    show: true,
    size: 18,
    fontFamily: 'simhei',
    bold: true,
    yPx: 31,
    xPx: 4,
    barcodeHeight: 62,
    barcodeStretchX: 1.06,
    captionGapPx: 1,
  },
  {
    id: 'title',
    kind: 'text',
    name: '标题行',
    format: '天然和田玉手镯',
    show: true,
    size: 18,
    fontFamily: 'simhei',
    bold: true,
    yPx: 136,
    offsetXPx: 2,
    offsetYPx: 2,
  },
  {
    id: 'cert',
    kind: 'text',
    name: '编号',
    format: '编号:',
    show: true,
    size: 18,
    fontFamily: 'simhei',
    bold: true,
    yPx: 160,
    textAlign: 'left',
    offsetXPx: 2,
  },
  {
    id: 'ring',
    kind: 'text',
    name: '圈口',
    format: '圈口:',
    show: true,
    size: 17,
    fontFamily: 'simhei',
    bold: true,
    yPx: 185,
    textAlign: 'left',
    offsetXPx: 2,
  },
  {
    id: 'price',
    kind: 'text',
    name: '售价',
    format: '售价:元',
    show: true,
    size: 17,
    fontFamily: 'simhei',
    bold: true,
    yPx: 208,
    textAlign: 'left',
    offsetXPx: 2,
  },
]

export function migrateFieldsToLines(
  fields: { key: string; label: string; show: boolean; size: number }[] | undefined,
): LabelLine[] {
  if (!fields?.length) return [...DEFAULT_LABEL_LINES]
  const size = (key: string, fallback: number) => fields.find((f) => f.key === key)?.size || fallback
  const show = (key: string, fallback: boolean) => fields.find((f) => f.key === key)?.show ?? fallback
  return DEFAULT_LABEL_LINES.map((line) => {
    if (line.id === 'barcode') {
      return { ...line, show: show('barcode', true), size: size('barcode', 14) }
    }
    if (line.id === 'title') {
      return { ...line, show: show('category', true), size: size('category', 16) }
    }
    if (line.id === 'cert') {
      return { ...line, show: show('certNo', true), size: size('certNo', 16) }
    }
    if (line.id === 'ring') {
      return { ...line, show: show('ringSize', true), size: size('ringSize', 15) }
    }
    if (line.id === 'price') {
      return { ...line, show: show('price', true), size: size('price', 15) }
    }
    return { ...line }
  })
}

export function newCustomTextLine(): LabelLine {
  return {
    id: `custom-${Date.now()}`,
    kind: 'text',
    name: '自定义',
    format: '文字内容',
    show: true,
    size: 14,
    fontFamily: 'simhei',
    bold: false,
  }
}
