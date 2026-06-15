export function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatRemarkWithOperationTime(remarkText: string): string {
  const text = remarkText.trim()
  if (!text) return text
  const now = new Date()
  const datePart = `${now.getFullYear() % 100}.${now.getMonth() + 1}.${now.getDate()}`
  const timePart = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  return `${text}-${datePart}-${timePart}`
}

export function computeNewRemark(oldRemark: string | null | undefined, userRemark: string): string | null {
  const user = userRemark.trim()
  if (!user) return null
  const formatted = formatRemarkWithOperationTime(user)
  const old = (oldRemark || '').trim()
  if (!old) return formatted
  if (old.includes(formatted)) return old
  return `${old}；${formatted}`
}

export function computeInboundRemark(oldRemark: string | null | undefined, userRemark = '', today?: string): string {
  const suffix = userRemark.trim() || `${today || todayStr()}退回`
  const formatted = formatRemarkWithOperationTime(suffix)
  const old = (oldRemark || '').trim()
  if (!old) return formatted
  if (old.includes(formatted)) return old
  return `${old}；${formatted}`
}

export function parseSalePrice(priceText: string): { value: number | null; error: string | null } {
  const s = priceText.trim()
  if (!s) return { value: null, error: '请输入实际售价' }
  const n = Number(s.replace(/,/g, ''))
  if (Number.isNaN(n)) return { value: null, error: '实际售价必须是数字' }
  return { value: n, error: null }
}

export function normalizeCertNo(certNo: string): string {
  return certNo.trim().toUpperCase()
}

export function qtyInStock(qty: number): boolean {
  return qty === 1
}
