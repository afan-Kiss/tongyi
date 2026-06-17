import type { Bracelet } from '@/api/types'
import { buildPrintTemplate } from '@/lib/buildPrintTemplate'
import { api } from '@/lib/api'

export async function printBraceletTag(
  bracelet: Bracelet,
  options?: { barcodeCaption?: string },
): Promise<string> {
  const settingsRes = await api.getSettings()
  const r = (await api.printBraceletTag({
    bracelet,
    template: buildPrintTemplate(options?.barcodeCaption),
    side: 'both',
    printerName: settingsRes.data.printerName || undefined,
  })) as { ok?: boolean; message?: string }
  if (!r.ok) throw new Error(r.message || '打印失败')
  return r.message || '已发送打印'
}
