import React, { useMemo } from 'react'

import { buildPrintTemplate } from '@/lib/buildPrintTemplate'
import { literalBarcodeContent, lineFontCss, resolveLiteralTextLines } from '@/lib/labelFormat'
import type { LabelPrintMemory } from '@/lib/labelPrintMemory'

type Props = {
  labelMemory: LabelPrintMemory
}

/** 展示吊牌实际会打印的内容（与编辑框一致） */
export const LabelPrintPreview: React.FC<Props> = ({ labelMemory }) => {
  const template = useMemo(() => buildPrintTemplate(labelMemory), [labelMemory])
  const lines = useMemo(() => resolveLiteralTextLines(template.lines), [template.lines])
  const barcodeLine = template.lines.find((l) => l.kind === 'barcode' && l.show)
  const barcodeContent = useMemo(() => literalBarcodeContent(barcodeLine), [barcodeLine])

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3">
      <p className="mb-2 text-[11px] font-medium text-slate-500">吊牌打印预览（25×70mm，正反面各一张）</p>
      <div
        className="mx-auto max-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-4 text-center shadow-sm"
        style={{ fontFamily: 'SimHei, "Microsoft YaHei", sans-serif' }}
      >
        {lines.map(({ line, text }) => {
          const css = lineFontCss(line)
          const left = line.textAlign === 'left'
          const extraBold = line.bold && (line.id === 'warning' || line.id === 'title')
          return (
            <div
              key={line.id}
              className={`leading-snug text-slate-900 ${left ? 'text-left pl-2' : 'text-center'}`}
              style={{
                ...css,
                fontWeight: extraBold ? 900 : css.fontWeight,
                WebkitTextStroke: extraBold ? '0.3px black' : undefined,
              }}
            >
              {text}
            </div>
          )
        })}
        {barcodeContent ? (
          <>
            <div className="mt-2 border-t border-slate-100 pt-2 font-mono text-[10px] tracking-widest text-slate-600">
              ||||| {barcodeContent} |||||
            </div>
            <p
              className="mt-1 text-[10px] tracking-wider text-slate-600"
              style={{
                ...lineFontCss(barcodeLine!),
                fontWeight: 900,
                WebkitTextStroke: '0.3px black',
              }}
            >
              {barcodeContent}
            </p>
            <p className="mt-1 text-[9px] text-slate-400">↑ 条形码区域（CODE128）</p>
          </>
        ) : (
          <p className="mt-2 text-[10px] text-slate-400">填写「条形码内容」后可预览条码</p>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
        预览与打印一致：上方各输入框写什么就打印什么，空行不打印。
      </p>
    </div>
  )
}
