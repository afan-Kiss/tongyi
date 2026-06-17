import type { Bracelet } from '@/api/types'
import { buildPrintTemplate } from '@/lib/buildPrintTemplate'
import type { LabelPrintMemory } from '@/lib/labelPrintMemory'
import { loadLabelPrintMemory, getBarcodeDigits } from '@/lib/labelPrintMemory'
import { api } from '@/lib/api'

export async function printBraceletTag(
  bracelet: Bracelet,
  options?: { labelMemory?: LabelPrintMemory },
): Promise<string> {
  const mem = options?.labelMemory ?? loadLabelPrintMemory()
  const settingsRes = await api.getSettings()
  const r = (await api.printBraceletTag({
    bracelet: {
      ...bracelet,
      barcodeValue: getBarcodeDigits(mem) || bracelet.barcodeValue || undefined,
    },
    template: buildPrintTemplate(mem),
    side: 'both',
    printerName: settingsRes.data.printerName || undefined,
  })) as { ok?: boolean; message?: string }
  if (!r.ok) throw new Error(r.message || '打印失败')
  return r.message || '已发送打印'
}
