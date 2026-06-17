import React, { useEffect, useMemo, useRef } from 'react'

import JsBarcode from 'jsbarcode'

import type { Bracelet, LabelLine, LabelTemplate } from '@/lib/api'

import {

  literalBarcodeContent,
  LABEL_CANVAS_REF_H,
  LABEL_CANVAS_REF_W,
  lineFontCss,
  lineFontStyleAttr,
  resolveLiteralTextLines,
} from '@/lib/labelFormat'

import { labelContentShift } from '@/lib/labelTemplateStorage'



interface Props {

  bracelet: Bracelet

  template: LabelTemplate

  side?: 'front' | 'back' | 'preview'

}



function renderLineStyle(line: LabelLine) {

  return lineFontCss(line)

}



function topPercent(yPx: number) {
  return `${(yPx / LABEL_CANVAS_REF_H) * 100}%`
}

function leftPercent(xPx: number) {
  return `${(xPx / LABEL_CANVAS_REF_W) * 100}%`
}

function linePositionStyle(line: LabelLine): React.CSSProperties {
  const ox = line.offsetXPx ?? 0
  const oy = line.offsetYPx ?? 0
  const align = line.textAlign === 'left' ? 'left' as const : 'center' as const
  const base: React.CSSProperties =
    align === 'left'
      ? { textAlign: 'left', paddingLeft: `${ox}px`, width: '100%' }
      : {}
  if (!ox && !oy && align === 'center') return base
  return { ...base, transform: `translate(${align === 'left' ? 0 : ox}px, ${oy}px)` }
}



export const LabelDesigner: React.FC<Props> = ({ bracelet, template, side = 'preview' }) => {

  const barcodeRef = useRef<SVGSVGElement>(null)

  const textLines = useMemo(
    () => resolveLiteralTextLines(template.lines),
    [template.lines],
  )

  const barcodeLine = template.lines.find((l) => l.kind === 'barcode' && l.show)

  const showBarcode = side !== 'front' && !!barcodeLine

  const showInfo = side !== 'back'

  const shift = labelContentShift(template)

  const fixedLayout = template.lines.some((l) => l.yPx != null)



  const barcodeDigits = literalBarcodeContent(barcodeLine)

  useEffect(() => {

    if (!barcodeRef.current || !showBarcode || !barcodeDigits) return

    try {

      JsBarcode(barcodeRef.current, barcodeDigits, {
        format: template.barcodeType as 'CODE128',
        width: 2,
        height: barcodeLine?.barcodeHeight ?? 57,
        displayValue: false,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000',
      })

    } catch {

      /* ignore */

    }

  }, [barcodeDigits, template.barcodeType, showBarcode, barcodeLine?.barcodeHeight])



  const caption = literalBarcodeContent(barcodeLine)



  if (fixedLayout) {

    return (

      <div

        className="print-label overflow-hidden rounded-xl border border-rose-100 bg-white text-center text-slate-800"

        style={{ width: `${template.widthMm}mm`, height: `${template.heightMm}mm`, position: 'relative' }}

      >

        <div

          style={{

            position: 'absolute',

            inset: 0,

            transform: `translate(${shift.xMm}mm, ${shift.yMm}mm)`,

          }}

        >

          {showBarcode && barcodeLine && barcodeLine.yPx != null && (
            <div
              className="absolute px-0"
              style={{
                top: topPercent(barcodeLine.yPx),
                left: barcodeLine.xPx != null ? leftPercent(barcodeLine.xPx) : 0,
                right: barcodeLine.xPx != null ? undefined : 0,
                width: barcodeLine.xPx != null ? `${((186 * (barcodeLine.barcodeStretchX ?? 1)) / LABEL_CANVAS_REF_W) * 100}%` : undefined,
              }}
            >
              <svg
                ref={barcodeRef}
                className={barcodeLine.xPx != null ? 'block' : 'mx-auto max-w-full'}
                style={{ height: barcodeLine.barcodeHeight ?? 57, width: '100%' }}
              />
              {caption && (
                <p className="mt-0.5 text-center" style={renderLineStyle(barcodeLine)}>
                  {caption}
                </p>
              )}
            </div>
          )}

          {showInfo &&
            textLines.map(({ line, text }) =>
              line.yPx != null ? (
                <p
                  key={line.id}
                  className={`absolute left-0 right-0 px-1 ${line.textAlign === 'left' ? 'text-left' : 'text-center'}`}
                  style={{
                    top: topPercent(line.yPx),
                    ...renderLineStyle(line),
                    ...linePositionStyle(line),
                  }}
                >
                  {text}
                </p>
              ) : null,
            )}

        </div>

      </div>

    )

  }



  return (

    <div

      className="print-label overflow-hidden rounded-xl border border-rose-100 bg-white text-center"

      style={{ width: `${template.widthMm}mm`, minHeight: `${template.heightMm}mm` }}

    >

      <div style={{ transform: `translate(${shift.xMm}mm, ${shift.yMm}mm)` }}>

        {showBarcode && barcodeLine && (

          <div className="border-b border-dashed border-slate-200 px-1 py-1">

            <svg ref={barcodeRef} className="mx-auto max-w-full" style={{ height: barcodeLine?.barcodeHeight ?? 57 }} />

            {caption && (

              <p className="mt-0.5 text-slate-800" style={renderLineStyle(barcodeLine)}>

                {caption}

              </p>

            )}

          </div>

        )}

        {showInfo && (

          <div className="space-y-0.5 px-1 py-2 text-slate-800">

            {textLines.map(({ line, text }) => (

              <p key={line.id} style={renderLineStyle(line)}>

                {text}

              </p>

            ))}

          </div>

        )}

      </div>

    </div>

  )

}



export function printLabel(bracelet: Bracelet, template: LabelTemplate) {

  const win = window.open('', '_blank', 'width=320,height=520')

  if (!win) return

  const textLines = resolveLiteralTextLines(template.lines)

  const barcodeLine = template.lines.find((l) => l.kind === 'barcode' && l.show)

  const shift = labelContentShift(template)

  const caption = literalBarcodeContent(barcodeLine)
  const barcodeDigits = caption

  const fixedLayout = template.lines.some((l) => l.yPx != null)



  if (fixedLayout) {

    const barcodeHtml =

      barcodeLine && barcodeLine.yPx != null && barcodeDigits

        ? `<div style="position:absolute;left:0;right:0;top:${topPercent(barcodeLine.yPx)};text-align:center">

            <svg id="bc" style="height:51px"></svg>

            <p style="${lineFontStyleAttr(barcodeLine)};margin:2px 0">${(caption ?? barcodeDigits).replace(/</g, '&lt;')}</p>

          </div>`

        : ''

    const textHtml = textLines

      .filter(({ line }) => line.yPx != null)

      .map(

        ({ line, text }) =>

          `<p style="position:absolute;left:0;right:0;top:${topPercent(line.yPx!)};${lineFontStyleAttr(line)};margin:0;text-align:center">${text.replace(/</g, '&lt;')}</p>`,

      )

      .join('')

    win.document.write(`

      <html><head><title>打印 ${bracelet.certNo}</title>

      <style>

        @page { size: ${template.widthMm}mm ${template.heightMm}mm; margin: 1mm; }

        body { margin:0; }

        .sheet { position:relative; width:${template.widthMm}mm; height:${template.heightMm}mm; }

        .content { position:absolute; inset:0; transform: translate(${shift.xMm}mm, ${shift.yMm}mm); }

      </style></head><body>

      <div class="sheet"><div class="content">

      ${barcodeHtml}

      ${textHtml}

      </div></div>

      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>

      <script>

        ${barcodeLine && barcodeDigits ? `JsBarcode("#bc", ${JSON.stringify(barcodeDigits)}, { format: "CODE128", width:2, height:51, displayValue:false, margin:8, background:"#ffffff", lineColor:"#000000" });` : ''}

        setTimeout(() => { window.print(); window.close(); }, 300);

      <\/script>

      </body></html>

    `)

    win.document.close()

    return

  }



  const textHtml = textLines

    .map(

      ({ line, text }) =>

        `<p style="${lineFontStyleAttr(line)};margin:2px 0">${text.replace(/</g, '&lt;')}</p>`,

    )

    .join('')

  const captionHtml =

    barcodeLine && caption

      ? `<p style="${lineFontStyleAttr(barcodeLine)};margin:2px 0">${caption.replace(/</g, '&lt;')}</p>`

      : ''

  win.document.write(`

    <html><head><title>打印 ${bracelet.certNo}</title>

    <style>

      @page { size: ${template.widthMm}mm ${template.heightMm}mm; margin: 1mm; }

      body { margin:0; text-align:center; }

      .content { transform: translate(${shift.xMm}mm, ${shift.yMm}mm); }

    </style></head><body>

    <div class="content">

    ${barcodeLine ? `<svg id="bc" style="height:51px"></svg>${captionHtml}` : ''}

    ${textHtml}

    </div>

    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>

    <script>

      ${barcodeLine && barcodeDigits ? `JsBarcode("#bc", ${JSON.stringify(barcodeDigits)}, { format: "CODE128", width:2, height:51, displayValue:false, margin:8, background:"#ffffff", lineColor:"#000000" });` : ''}

      setTimeout(() => { window.print(); window.close(); }, 300);

    <\/script>

    </body></html>

  `)

  win.document.close()

}

