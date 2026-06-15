import type { Bracelet } from '@/api/types'
import { BUILTIN_LABEL_TEMPLATE } from '@/lib/labelTemplateStorage'
import { api } from '@/lib/api'

export async function printBraceletTag(bracelet: Bracelet): Promise<string> {
  const settingsRes = await api.getSettings()
  const r = (await api.printBraceletTag({
    bracelet,
    template: BUILTIN_LABEL_TEMPLATE,
    side: 'both',
    printerName: settingsRes.data.printerName || undefined,
  })) as { ok?: boolean; message?: string }
  if (!r.ok) throw new Error(r.message || '打印失败')
  return r.message || '已发送打印'
}
