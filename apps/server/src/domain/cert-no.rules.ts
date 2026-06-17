/** 编号解析与生成（与 CERT_NO_REGEX 前缀一致，长前缀优先匹配） */
export const CERT_PREFIXES = [
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DK', 'DL', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DW',
  'ZQ', 'F', 'D',
] as const

export function parseCertNoParts(certNo: string): { prefix: string; num: number; width: number } | null {
  const code = certNo.trim().toUpperCase()
  if (!code) return null
  for (const prefix of CERT_PREFIXES) {
    if (!code.startsWith(prefix)) continue
    const rest = code.slice(prefix.length)
    if (!/^\d+$/.test(rest)) continue
    const num = parseInt(rest, 10)
    if (Number.isNaN(num)) continue
    return { prefix, num, width: rest.length }
  }
  return null
}

export function defaultDigitWidth(prefix: string): number {
  if (prefix === 'F') return 5
  if (prefix === 'ZQ') return 4
  return 3
}

export function formatCertNo(prefix: string, num: number, widthHint?: number): string {
  const width = Math.max(widthHint ?? defaultDigitWidth(prefix), defaultDigitWidth(prefix))
  return `${prefix}${String(num).padStart(width, '0')}`
}

/** 编号联想：输入 F 时不应匹配 ZF 等更长前缀的编号 */
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
