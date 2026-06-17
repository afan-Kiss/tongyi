/** 与后端 cert-no.rules.ts 一致的编号联想匹配 */
const CERT_PREFIXES = [
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DK', 'DL', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DW',
  'ZQ', 'F', 'D',
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
