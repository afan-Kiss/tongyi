import React, { useEffect, useMemo, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import type { LabelLine } from '@/api/types'
import { buildPrintTemplate } from '@/lib/buildPrintTemplate'
import { lineFontCss } from '@/lib/labelFormat'
import { getBarcodeDigits, type LabelPrintMemory } from '@/lib/labelPrintMemory'

/** 详情页吊牌预览顺序（不含标题行） */
const PREVIEW_LINE_ORDER = ['warning', 'barcode', 'cert', 'ring', 'price'] as const

const FONT_SCALE = 0.52

interface Props {
  memory: LabelPrintMemory
}

export const LabelTagPreview: React.FC<Props> = ({ memory }) => {
  const template = useMemo(() => buildPrintTemplate(memory), [memory])
  const barcodeRef = useRef<SVGSVGElement>(null)
  const barcodeDigits = getBarcodeDigits(memory)
  const barcodeLine = template.lines.find((l) => l.id === 'barcode' && l.show)

  useEffect(() => {
    if (!barcodeRef.current || !barcodeDigits) return
    try {
      JsBarcode(barcodeRef.current, barcodeDigits, {
        format: (template.barcodeType as 'CODE128') || 'CODE128',
        width: 1,
        height: Math.max(22, Math.round((barcodeLine?.barcodeHeight ?? 57) * FONT_SCALE)),
        displayValue: false,
        margin: 1,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch {
      /* ignore invalid barcode */
    }
  }, [barcodeDigits, barcodeLine?.barcodeHeight, template.barcodeType])

  const lineText = (line: LabelLine): string => {
    const text = (memory.lineFormats[line.id] ?? line.format)?.trim()
    return text || ''
  }

  const textStyle = (line: LabelLine): React.CSSProperties => {
    const css = lineFontCss(line)
    const size = Math.max(8, Math.min(Math.round(line.size * FONT_SCALE), 10))
    return {
      fontSize: `${size}px`,
      fontWeight: css.fontWeight,
      fontFamily: css.fontFamily,
    }
  }

  return (
    <div className="mx-auto w-fit max-w-[108px] space-y-0.5 rounded-lg border border-dashed border-rose-100 bg-rose-50/30 px-2 py-1.5 text-center">
      {PREVIEW_LINE_ORDER.map((id) => {
        const line = template.lines.find((l) => l.id === id)
        if (!line?.show) return null

        if (id === 'barcode') {
          if (!barcodeDigits) return null
          return (
            <div key="barcode" className="py-0.5">
              <svg ref={barcodeRef} className="mx-auto block w-full max-w-full" aria-hidden />
              <p
                className="mt-0.5 text-center font-mono tracking-wider text-slate-800"
                style={barcodeLine ? textStyle(barcodeLine) : undefined}
              >
                {barcodeDigits}
              </p>
            </div>
          )
        }

        if (line.kind !== 'text') return null
        const text = lineText(line)
        if (!text) return null
        return (
          <p
            key={line.id}
            className={`leading-tight text-slate-800 ${line.textAlign === 'left' ? 'text-left' : 'text-center'}`}
            style={textStyle(line)}
          >
            {text}
          </p>
        )
      })}
    </div>
  )
}
