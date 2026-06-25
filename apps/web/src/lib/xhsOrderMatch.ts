import type { XhsOrderRow } from '@/lib/xhsOrdersApi'

const DEFAULT_SHIPPING = 18
const TOLERANCE_HIGH = 3
const TOLERANCE_LOW = 10
const AUTO_RECOMMEND_MIN = 90

export interface XhsOrderMatch {
  order: XhsOrderRow
  score: number
  diff: number
  inferredProductAmount: number
  matchedAmount: number
  matchFieldLabel: string
  matchReason: string
  autoConfirm: boolean
}

export function parseAmountText(text: string): number | null {
  const s = (text || '').trim().replace(/,/g, '').replace(/[¥￥]/g, '')
  if (!s) return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

function shippingFee(order: XhsOrderRow): number {
  return order.shippingFee > 0 ? order.shippingFee : DEFAULT_SHIPPING
}

export function inferProductAmount(order: XhsOrderRow): number {
  if (order.productPrice > 0) return order.productPrice
  const ship = shippingFee(order)
  const paid = order.orderPaid > 0 ? order.orderPaid : parseAmountText(order.amount) || 0
  const red = order.redDiscountAmount || 0
  return paid - ship + red
}

function scoreFromDiff(diff: number): { score: number; visible: boolean } {
  if (diff <= 0) return { score: 100, visible: true }
  if (diff <= 0.01) return { score: 99, visible: true }
  if (diff <= TOLERANCE_HIGH) {
    const score = Math.max(90, Math.min(99, 100 - Math.floor(diff * 4)))
    return { score, visible: true }
  }
  if (diff <= TOLERANCE_LOW) {
    const over = diff - TOLERANCE_HIGH
    const penalty = Math.floor((over * 3) / 2)
    const score = Math.max(70, Math.min(79, 79 - penalty))
    return { score, visible: true }
  }
  return { score: 0, visible: false }
}

function formatReason(field: string, matched: number, input: number, diff: number): string {
  const mi = Number.isInteger(matched) ? matched : matched
  const ii = Number.isInteger(input) ? input : input
  const di = Number.isInteger(diff) ? diff : diff
  if (diff <= 0.01) return `${field}${mi}，与你输入${ii}完全一致`
  if (diff <= TOLERANCE_HIGH) return `${field}${mi}，与你输入${ii}相差${di}元，在容差范围内`
  if (diff <= TOLERANCE_LOW) return `${field}${mi}，与你输入${ii}相差${di}元，请人工确认`
  return ''
}

function amountTargets(order: XhsOrderRow): { label: string; amount: number }[] {
  if (order.productPrice > 0) return [{ label: '商品价格', amount: order.productPrice }]
  const paid = order.orderPaid > 0 ? order.orderPaid : parseAmountText(order.amount) || 0
  const red = order.redDiscountAmount || 0
  const ship = shippingFee(order)
  const inferred = paid - ship + red
  const seen = new Set<number>()
  const out: { label: string; amount: number }[] = []
  for (const [label, amt] of [
    ['实付', paid],
    ['商品反推', inferred],
    ['实付减运费', paid - ship],
    ['商品反推加运费', inferred + ship],
  ] as const) {
    if (amt < 0) continue
    const key = Math.round(amt * 100)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ label, amount: amt })
  }
  if (red > 0) {
    const paidPlusRed = paid + red
    const key = Math.round(paidPlusRed * 100)
    if (!seen.has(key) && paidPlusRed >= 0) out.push({ label: '实付加平台优惠', amount: paidPlusRed })
  }
  return out
}

function bestAmountMatch(order: XhsOrderRow, input: number) {
  const inferred = inferProductAmount(order)
  let best: XhsOrderMatch | null = null
  for (const t of amountTargets(order)) {
    const diff = Math.abs(t.amount - input)
    const { score, visible } = scoreFromDiff(diff)
    if (!visible) continue
    const reason = formatReason(t.label, t.amount, input, diff)
    const candidate: XhsOrderMatch = {
      order,
      score,
      diff,
      inferredProductAmount: inferred,
      matchedAmount: t.amount,
      matchFieldLabel: t.label,
      matchReason: reason,
      autoConfirm: score >= AUTO_RECOMMEND_MIN && diff <= TOLERANCE_HIGH,
    }
    if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.diff < best.diff)) {
      best = candidate
    }
  }
  return best
}

export function matchOrdersByAmount(orders: XhsOrderRow[], priceText: string): XhsOrderMatch[] {
  const input = parseAmountText(priceText)
  if (input === null) return []
  const matches: XhsOrderMatch[] = []
  for (const o of orders) {
    const base = o.productPrice > 0 ? o.productPrice : o.orderPaid > 0 ? o.orderPaid : parseAmountText(o.amount) || 0
    if (base <= 0) continue
    const m = bestAmountMatch(o, input)
    if (m) matches.push(m)
  }
  matches.sort((a, b) => b.score - a.score || a.diff - b.diff || b.order.createdAt - a.order.createdAt)
  return matches
}

export function listOrdersByTime(orders: XhsOrderRow[]): XhsOrderMatch[] {
  return [...orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((order) => ({
      order,
      score: -1,
      diff: 0,
      inferredProductAmount: inferProductAmount(order),
      matchedAmount: 0,
      matchFieldLabel: '',
      matchReason: '',
      autoConfirm: false,
    }))
}

export function buildOrderMatches(orders: XhsOrderRow[], priceText: string): XhsOrderMatch[] {
  const text = (priceText || '').trim()
  if (!text) return listOrdersByTime(orders)
  if (parseAmountText(text) === null) return []
  return matchOrdersByAmount(orders, text)
}

export function pickRecommendedMatch(matches: XhsOrderMatch[]): XhsOrderMatch | null {
  const high = matches.filter((m) => m.score >= AUTO_RECOMMEND_MIN)
  return high.length === 1 ? high[0] : null
}

export function formatOrderTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function fmtYuan(n: number): string {
  if (!n) return '0'
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}
