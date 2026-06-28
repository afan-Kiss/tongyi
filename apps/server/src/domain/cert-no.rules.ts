/** 编号解析与生成（与 CERT_NO_REGEX 前缀一致，长前缀优先匹配） */
export const CERT_PREFIXES = [
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DK', 'DL', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DW',
  'ZF', 'ZQ', 'ZX', 'F', 'D',
] as const

/** 从编号提取字母前缀（已知前缀优先，否则按 字母+数字 规则，如 ZX123 → ZX） */
export function extractCertPrefix(certNo: string): string | null {
  const parsed = parseCertNoParts(certNo)
  if (parsed) return parsed.prefix
  const code = certNo.trim().toUpperCase()
  const m = code.match(/^([A-Z]+)(\d+)$/)
  return m?.[1] ?? null
}

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
  if (prefix === 'ZQ' || prefix === 'ZF' || prefix === 'ZX') return 4
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

/** 模糊包含匹配：仅纯数字片段（如 9527→ZQ9527），带字母的必须前缀匹配 */
export function certMatchesContainsSearchQuery(certNo: string, query: string): boolean {
  const q = query.trim().toUpperCase()
  const cert = certNo.trim().toUpperCase()
  if (!q || !cert.includes(q)) return false
  if (cert.startsWith(q)) return certMatchesSearchQuery(cert, q)
  if (!/^\d+$/.test(q)) return false
  return true
}
