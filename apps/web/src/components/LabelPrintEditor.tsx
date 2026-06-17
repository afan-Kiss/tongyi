import React from 'react'

import { DEFAULT_LABEL_LINES } from '@/lib/labelFormat'
import { applyFormSyncToLabelMemory } from '@/lib/labelPrintSync'
import { saveLabelPrintMemory, type LabelPrintMemory } from '@/lib/labelPrintMemory'

type Props = {
  memory: LabelPrintMemory
  onChange: (memory: LabelPrintMemory) => void
  /** 上方表单：编号、圈口、成本自动同步到吊牌对应行 */
  formSync?: { certNo: string; ringSize: string; cost?: string }
}

const LINE_ORDER = ['warning', 'barcode', 'title', 'cert', 'ring', 'price'] as const

const EDITABLE_LINES = DEFAULT_LABEL_LINES.filter((l) => l.show)

const AUTO_SYNC_IDS = new Set(['cert', 'ring'])

function lineLabel(line: (typeof EDITABLE_LINES)[number]): string {
  if (line.kind === 'barcode') return '条形码内容'
  return line.name
}

export const LabelPrintEditor: React.FC<Props> = ({ memory, onChange, formSync }) => {
  const displayMemory = React.useMemo(
    () => (formSync ? applyFormSyncToLabelMemory(memory, formSync) : memory),
    [memory, formSync],
  )

  const setLine = (id: string, format: string) => {
    if (AUTO_SYNC_IDS.has(id)) return
    const next = { ...memory, lineFormats: { ...memory.lineFormats, [id]: format } }
    saveLabelPrintMemory(next)
    onChange(next)
  }

  const ordered = LINE_ORDER.map((id) => EDITABLE_LINES.find((l) => l.id === id)).filter(
    (l): l is (typeof EDITABLE_LINES)[number] => !!l,
  )

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-400">
        改什么打印什么，会自动记住（黑体）。编号、圈口、售价随上方表单填入。
      </p>
      {ordered.map((line) => {
        const autoSync =
          AUTO_SYNC_IDS.has(line.id) ||
          (line.id === 'price' && !!formSync?.cost?.trim())
        const value = displayMemory.lineFormats[line.id] ?? line.format
        return (
          <label key={line.id} className="block text-sm">
            <span className="text-slate-500">
              {lineLabel(line)}
              {autoSync && (
                <span className="ml-1 text-[10px] text-slate-400">（自动）</span>
              )}
            </span>
            <input
              className={`mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm ${
                autoSync ? 'bg-slate-50 text-slate-600' : ''
              } ${line.kind === 'barcode' ? 'font-mono tracking-widest' : ''}`}
              value={value}
              readOnly={autoSync}
              onChange={(e) => setLine(line.id, e.target.value)}
              placeholder={line.kind === 'barcode' ? '输入数字或编码，用于生成条形码' : undefined}
              inputMode={line.kind === 'barcode' ? 'numeric' : undefined}
            />
          </label>
        )
      })}
    </div>
  )
}
