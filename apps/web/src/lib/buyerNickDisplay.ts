/** 买家昵称：优先展示未脱敏的完整昵称 */

function str(v: unknown): string {
  if (v == null || v === '') return ''
  return String(v).trim()
}

export function isMaskedBuyerNick(nick: string): boolean {
  const s = str(nick)
  if (!s || s === '买家') return false
  if (s.includes('*')) return true
  if (/^[xX]{1,4}$/.test(s)) return true
  return false
}

export function pickBestBuyerNick(...candidates: unknown[]): string {
  const list = [...new Set(candidates.map(str).filter(Boolean))]
  if (!list.length) return '买家'
  const clear = list.filter((n) => !isMaskedBuyerNick(n))
  const pool = clear.length ? clear : list.filter((n) => n !== '买家')
  if (!pool.length) return list[0] || '买家'
  return pool.sort((a, b) => b.length - a.length)[0]
}
