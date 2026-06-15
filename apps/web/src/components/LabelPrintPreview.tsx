import React, { useMemo } from 'react'

import type { Bracelet } from '@/api/types'
import { BUILTIN_LABEL_TEMPLATE } from '@/lib/labelTemplateStorage'
import { buildLabelData, resolveTextLines } from '@/lib/labelFormat'

type Props = {
  bracelet: Partial<Bracelet> & { certNo: string }
}

/** 展示吊牌实际会打印的文字行（不含条码图形） */
export const LabelPrintPreview: React.FC<Props> = ({ bracelet }) => {
  const lines = useMemo(() => {
    const data = buildLabelData({
      id: 'preview',
      certNo: bracelet.certNo,
      qty: 1,
      category: bracelet.category,
      ringSize: bracelet.ringSize,
      cost: bracelet.cost,
      actualPrice: bracelet.actualPrice,
      remark: bracelet.remark,
      detail: bracelet.detail,
    } as Bracelet)
    return resolveTextLines(BUILTIN_LABEL_TEMPLATE.lines, data)
  }, [bracelet])

  const code = bracelet.certNo.trim().toUpperCase()
  if (!code) {
    return <p className="text-[11px] text-slate-400">填写编号后可预览吊牌内容</p>
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3">
      <p className="mb-2 text-[11px] font-medium text-slate-500">吊牌打印预览（25×70mm，正反面各一张）</p>
      <div className="mx-auto max-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-4 text-center shadow-sm">
        {lines.map(({ line, text }) => (
          <div
            key={line.id}
            className="leading-snug text-slate-900"
            style={{ fontSize: Math.max(11, Math.min(line.size, 16)), fontWeight: line.bold ? 700 : 400 }}
          >
            {text}
          </div>
        ))}
        <div className="mt-2 border-t border-slate-100 pt-2 font-mono text-[10px] tracking-widest text-slate-600">
          ||||| {code} |||||
        </div>
        <p className="mt-1 text-[9px] text-slate-400">↑ 条形码区域（CODE128）</p>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        圈口、售价等字段为空时对应行不打印。售价优先取实际售价，否则取成本。
      </p>
    </div>
  )
}
