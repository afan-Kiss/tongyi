import React from 'react'

import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'
import { computeBarcodeDigits, fillLabelLinesFromForm } from '@/lib/labelPrintSync'
import {
  normalizeBarcodePrefix,
  saveLabelPrintMemory,
  type LabelPrintMemory,
} from '@/lib/labelPrintMemory'

type Props = {
  memory: LabelPrintMemory
  onChange: (memory: LabelPrintMemory) => void
  /** 上方基础信息，用于一键填充 */
  formSync?: { certNo: string; ringSize: string; cost?: string; batch?: string }
  /** 默认 true；库存抽屉编辑时不写入全局 localStorage */
  persistToLocalStorage?: boolean
}

const LINE_ORDER = ['warning', 'barcode', 'title', 'cert', 'ring', 'price'] as const

const EDITABLE_LINES = DEFAULT_LABEL_LINES.filter((l) => l.show)

function lineLabel(line: (typeof EDITABLE_LINES)[number]): string {
  if (line.kind === 'barcode') return '条形码内容'
  return line.name
}

function barcodeExample(prefix: string, cost?: string, ringSize?: string): string {
  const sample =
    computeBarcodeDigits(cost || '1000', ringSize || '57', prefix) ??
    `${prefix}301057`
  return sample
}

export const LabelPrintEditor: React.FC<Props> = ({
  memory,
  onChange,
  formSync,
  persistToLocalStorage = true,
}) => {
  const prefix = normalizeBarcodePrefix(memory.barcodePrefix)

  const persist = (next: LabelPrintMemory) => {
    if (persistToLocalStorage) saveLabelPrintMemory(next)
    onChange(next)
  }

  const setLine = (id: string, format: string) => {
    persist({
      ...memory,
      lineFormats: { ...memory.lineFormats, [id]: format },
      barcodeManual: id === 'barcode' ? true : memory.barcodeManual,
      priceManual: id === 'price' ? true : memory.priceManual,
    })
  }

  const setPrefix = (raw: string) => {
    const nextPrefix = normalizeBarcodePrefix(raw)
    let next: LabelPrintMemory = { ...memory, barcodePrefix: nextPrefix, barcodeManual: false }
    if (formSync) {
      next = fillLabelLinesFromForm(next, formSync, { overwriteBarcode: true, overwritePrice: false })
    }
    persist(next)
  }

  const fillFromForm = () => {
    if (!formSync) return
    const next = fillLabelLinesFromForm(
      { ...memory, barcodeManual: false, priceManual: false },
      formSync,
      { overwriteBarcode: true, overwritePrice: true },
    )
    persist(next)
  }

  const ordered = LINE_ORDER.map((id) => EDITABLE_LINES.find((l) => l.id === id)).filter(
    (l): l is (typeof EDITABLE_LINES)[number] => !!l,
  )

  const example = barcodeExample(prefix, formSync?.cost, formSync?.ringSize)

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        打印以本区内容为准，改什么打什么（黑体）。条形码规则：前缀 + (成本×3+10) + 圈口整数。
      </p>
      <label className="block text-sm">
        <span className="text-slate-500">条形码前缀（自动记忆）</span>
        <input
          className="mt-1 w-full max-w-[8rem] rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm tracking-widest"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="02"
          inputMode="numeric"
          maxLength={4}
        />
      </label>
      {formSync && (
        <button
          type="button"
          onClick={fillFromForm}
          className="text-[11px] text-rose-500 underline"
        >
          用上方基础信息填充吊牌（含按规则生成条形码）
        </button>
      )}
      {ordered.map((line) => {
        const value = memory.lineFormats[line.id] ?? line.format
        return (
          <label key={line.id} className="block text-sm">
            <span className="text-slate-500">{lineLabel(line)}</span>
            <input
              className={`mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm ${
                line.kind === 'barcode' ? 'font-mono tracking-widest' : ''
              }`}
              value={value}
              onChange={(e) => setLine(line.id, e.target.value)}
              placeholder={
                line.kind === 'barcode'
                  ? `如 ${example}（${prefix}+成本×3+10+圈口）`
                  : undefined
              }
              inputMode={line.kind === 'barcode' ? 'numeric' : undefined}
            />
          </label>
        )
      })}
    </div>
  )
}
