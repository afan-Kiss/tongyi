/** 与后端 cert-no.rules.ts 一致的编号联想匹配 */
const CERT_PREFIXES = [
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DK', 'DL', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DW',
  'ZF', 'ZQ', 'ZX', 'F', 'D',
] as const

export function certMatchesSearchQuery(certNo: string, query: string): boolean {
  const q = query.trim().toUpperCase()
  const cert = certNo.trim().toUpperCase()
  if (!q || !cert.startsWith(q)) return false
  for (const prefix of CERT_PREFIXES) {
    if (prefix.length <= q.length) continue
    if (!prefix.startsWith(q)) continue
    if (cert.startsWith(prefix)) return false
  }
  return true
}

/** 仅纯数字片段做中间模糊匹配（如 9527→ZQ9527） */
export function certMatchesContainsSearchQuery(certNo: string, query: string): boolean {
  const q = query.trim().toUpperCase()
  const cert = certNo.trim().toUpperCase()
  if (!q || !cert.includes(q)) return false
  if (cert.startsWith(q)) return certMatchesSearchQuery(cert, q)
  if (!/^\d+$/.test(q)) return false
  return true
}

/** 联想下拉：字母前缀走前缀规则，纯数字可走片段匹配 */
export function certMatchesAutocomplete(certNo: string, query: string): boolean {
  const q = query.trim().toUpperCase()
  if (!q) return false
  if (certNo.trim().toUpperCase().startsWith(q)) return certMatchesSearchQuery(certNo, q)
  return certMatchesContainsSearchQuery(certNo, q)
}
