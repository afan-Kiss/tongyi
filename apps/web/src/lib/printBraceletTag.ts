import type { Bracelet } from '@/api/types'
import { buildPrintTemplate } from '@/lib/buildPrintTemplate'
import { applyFormSyncToLabelMemory } from '@/lib/labelPrintSync'
import type { LabelPrintMemory } from '@/lib/labelPrintMemory'
import { loadLabelPrintMemory, getBarcodeDigits } from '@/lib/labelPrintMemory'
import { api } from '@/lib/api'

export async function printBraceletTag(
  bracelet: Bracelet,
  options?: { labelMemory?: LabelPrintMemory },
): Promise<string> {
  let mem = applyFormSyncToLabelMemory(options?.labelMemory ?? loadLabelPrintMemory(), {
    certNo: bracelet.certNo,
    ringSize: bracelet.ringSize,
    cost: bracelet.cost,
  })
  const barcodeDigits = getBarcodeDigits(mem) || bracelet.barcodeValue?.trim() || ''
  if (barcodeDigits && !getBarcodeDigits(mem)) {
    mem = { ...mem, lineFormats: { ...mem.lineFormats, barcode: barcodeDigits } }
  }
  const settingsRes = await api.getSettings()
  const r = (await api.printBraceletTag({
    bracelet,
    template: buildPrintTemplate(mem),
    side: 'both',
    printerName: settingsRes.data.printerName || undefined,
  })) as { ok?: boolean; message?: string }
  if (!r.ok) throw new Error(r.message || '打印失败')
  return r.message || '已发送打印'
}
