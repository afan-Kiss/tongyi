import React from 'react'

import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'
import { fillLabelLinesFromForm } from '@/lib/labelPrintSync'
import { saveLabelPrintMemory, type LabelPrintMemory } from '@/lib/labelPrintMemory'

type Props = {
  memory: LabelPrintMemory
  onChange: (memory: LabelPrintMemory) => void
  /** 上方基础信息，用于一键填充 */
  formSync?: { certNo: string; ringSize: string; cost?: string; batch?: string }
}

const LINE_ORDER = ['warning', 'barcode', 'title', 'cert', 'ring', 'price'] as const

const EDITABLE_LINES = DEFAULT_LABEL_LINES.filter((l) => l.show)

function lineLabel(line: (typeof EDITABLE_LINES)[number]): string {
  if (line.kind === 'barcode') return '条形码内容'
  return line.name
}

export const LabelPrintEditor: React.FC<Props> = ({ memory, onChange, formSync }) => {
  const setLine = (id: string, format: string) => {
    const next: LabelPrintMemory = {
      ...memory,
      lineFormats: { ...memory.lineFormats, [id]: format },
      barcodeManual: id === 'barcode' ? true : memory.barcodeManual,
    }
    saveLabelPrintMemory(next)
    onChange(next)
  }

  const fillFromForm = () => {
    if (!formSync) return
    const next = fillLabelLinesFromForm(
      { ...memory, barcodeManual: false },
      formSync,
      { overwriteBarcode: true },
    )
    saveLabelPrintMemory(next)
    onChange(next)
  }

  const ordered = LINE_ORDER.map((id) => EDITABLE_LINES.find((l) => l.id === id)).filter(
    (l): l is (typeof EDITABLE_LINES)[number] => !!l,
  )

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        打印以本区内容为准，改什么打什么（黑体）。条形码规则：前两位批次 + (成本×3+10+圈口整数)。
      </p>
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
                  ? '如 02301057（02批次+成本1000+圈口57）'
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
