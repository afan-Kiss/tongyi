export type SalesChannel = '线上' | '线下'

export interface OutboundFormMemory {
  remarkText: string
  salesPerson: string
  salesChannel: SalesChannel
  salesPersons: string[]
}

const STORAGE_KEY = 'jade-outbound-form-v1'

export const DEFAULT_OUTBOUND_REMARK = '小红书发出'

export const DEFAULT_OUTBOUND_FORM: OutboundFormMemory = {
  remarkText: DEFAULT_OUTBOUND_REMARK,
  salesPerson: '飞云',
  salesChannel: '线上',
  salesPersons: ['飞云', '子杰'],
}

export function loadOutboundFormMemory(): OutboundFormMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_OUTBOUND_FORM, salesPersons: [...DEFAULT_OUTBOUND_FORM.salesPersons] }
    const parsed = JSON.parse(raw) as Partial<OutboundFormMemory>
    const persons = Array.isArray(parsed.salesPersons) && parsed.salesPersons.length
      ? [...parsed.salesPersons]
      : [...DEFAULT_OUTBOUND_FORM.salesPersons]
    const channel = parsed.salesChannel === '线下' ? '线下' : '线上'
    return {
      remarkText: parsed.remarkText?.trim() || DEFAULT_OUTBOUND_REMARK,
      salesPerson: parsed.salesPerson?.trim() || DEFAULT_OUTBOUND_FORM.salesPerson,
      salesChannel: channel,
      salesPersons: persons,
    }
  } catch {
    return { ...DEFAULT_OUTBOUND_FORM, salesPersons: [...DEFAULT_OUTBOUND_FORM.salesPersons] }
  }
}

export function saveOutboundFormMemory(data: Partial<OutboundFormMemory>): void {
  const prev = loadOutboundFormMemory()
  const next: OutboundFormMemory = {
    remarkText: data.remarkText?.trim() || prev.remarkText,
    salesPerson: data.salesPerson?.trim() || prev.salesPerson,
    salesChannel: data.salesChannel === '线下' ? '线下' : data.salesChannel === '线上' ? '线上' : prev.salesChannel,
    salesPersons: data.salesPersons?.length ? [...data.salesPersons] : prev.salesPersons,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}

/** 出库成功后记忆销售人员/渠道（与辅助出库软件一致） */
export function saveOutboundSalesSelection(person: string, channel: SalesChannel): void {
  const p = person.trim()
  const c = channel === '线下' ? '线下' : '线上'
  if (!p) return
  const prev = loadOutboundFormMemory()
  const persons = prev.salesPersons.includes(p) ? prev.salesPersons : [p, ...prev.salesPersons.filter((x) => x !== p)].slice(0, 30)
  saveOutboundFormMemory({ salesPerson: p, salesChannel: c, salesPersons: persons })
}

/** 输入/选择销售人员时立即写入记忆（不必等出库成功） */
export function rememberSalesPerson(person: string): void {
  const p = person.trim()
  if (!p) return
  const prev = loadOutboundFormMemory()
  const persons = prev.salesPersons.includes(p)
    ? [p, ...prev.salesPersons.filter((x) => x !== p)]
    : [p, ...prev.salesPersons]
  saveOutboundFormMemory({ salesPerson: p, salesPersons: persons.slice(0, 30) })
}
