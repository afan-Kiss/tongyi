import type { Bracelet } from '@/api/types'

/** 标签字段取值（含 detail 克重、售价/成本） */
export function braceletLabelValue(bracelet: Bracelet, key: string): string {
  if (key === 'barcode') return bracelet.certNo
  if (key === 'weightGram') return bracelet.detail?.weightGram || ''
  if (key === 'price') return bracelet.actualPrice || bracelet.cost || ''
  const record = bracelet as unknown as Record<string, string | undefined>
  return record[key] || ''
}
