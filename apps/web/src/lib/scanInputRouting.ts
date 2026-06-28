/** 与 cert-no.rules / certSearch 一致的货号前缀 */
const CERT_PREFIXES = [
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DK', 'DL', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DW',
  'ZF', 'ZQ', 'ZX', 'F', 'D',
] as const

/** 小红书订单号 / 售后单号：不走库存扫码 */
function looksLikeXhsOrderToken(code: string): boolean {
  const s = code.trim().toUpperCase()
  return /^P\d{6,}$/.test(s) || /^R\d{4,}$/.test(s)
}

/** 常见快递单号前缀：走查订单 */
function looksLikeExpressToken(code: string): boolean {
  const s = code.trim().toUpperCase()
  if (s.length < 8) return false
  return /^(SF|YT|YD|JD|EMS|ZTO|YTO|STO|HTKY|DBL|HHTT|UC|QFKD|ANE|ZJS|JT|FW|LB|DN)/.test(s)
}

/** 货号编号（含前缀片段，如 DA、DA00114） */
export function looksLikeCertScanInput(code: string): boolean {
  const s = code.trim().toUpperCase()
  if (!s || looksLikeXhsOrderToken(s) || looksLikeExpressToken(s)) return false

  for (const prefix of CERT_PREFIXES) {
    if (!s.startsWith(prefix)) continue
    const rest = s.slice(prefix.length)
    if (rest === '' || /^\d+$/.test(rest)) return true
  }

  if (/^[A-Z]{1,2}$/.test(s) && CERT_PREFIXES.some((p) => p.startsWith(s))) return true
  return false
}

/** 吊牌条形码：纯数字 6–20 位 */
export function looksLikeBarcodeScanInput(code: string): boolean {
  const s = code.trim()
  return /^\d{6,20}$/.test(s)
}

/** 应先查库存（货号 / 条码） */
export function shouldTryInventoryScan(code: string): boolean {
  return looksLikeCertScanInput(code) || looksLikeBarcodeScanInput(code)
}

/** 库存未命中时是否改查订单（条码/纯数字可能是物流单号） */
export function shouldFallbackToOrderSearch(code: string): boolean {
  if (looksLikeCertScanInput(code) && !looksLikeBarcodeScanInput(code)) return false
  if (looksLikeBarcodeScanInput(code)) return true
  return false
}
