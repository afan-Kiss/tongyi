import { normalizeCertNo } from './inventory.rules'
import {
  MANUAL_EXCEL_REVIEW_MSG,
  STALE_EXCEL_RETRY_MSG,
} from './excel-retry.constants'

export type BraceletStateFields = {
  certNo: string
  qty: number
  soldDate?: string | null
  returnDate?: string | null
  actualPrice?: string | null
  orderNo?: string | null
  updatedAt?: Date | string | null
}

function normTimestamp(v: unknown): number | null {
  if (v == null || v === '') return null
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v))
  return Number.isFinite(t) ? t : null
}

function normScalar(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object' && v !== null && typeof (v as { toString?: () => string }).toString === 'function') {
    const s = String(v).trim()
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
    return s || null
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
  return s || null
}

function normQty(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function normPrice(v: unknown): string | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (Number.isFinite(n)) return String(n)
  return normScalar(v)
}

/** 校验当前数据库状态是否与操作日志 resultJson 一致，防止过期 Excel 重试覆盖新状态 */
export function validateBraceletMatchesLogResult(
  bracelet: BraceletStateFields,
  resultJson: string | null | undefined,
): { ok: true } | { ok: false; kind: 'stale' | 'manual'; message: string } {
  if (!resultJson?.trim()) {
    return { ok: false, kind: 'manual', message: MANUAL_EXCEL_REVIEW_MSG }
  }

  let expected: Record<string, unknown>
  try {
    expected = JSON.parse(resultJson) as Record<string, unknown>
  } catch {
    return { ok: false, kind: 'manual', message: MANUAL_EXCEL_REVIEW_MSG }
  }

  if (normalizeCertNo(bracelet.certNo) !== normalizeCertNo(String(expected.certNo ?? ''))) {
    return { ok: false, kind: 'stale', message: STALE_EXCEL_RETRY_MSG }
  }
  if (normQty(bracelet.qty) !== normQty(expected.qty)) {
    return { ok: false, kind: 'stale', message: STALE_EXCEL_RETRY_MSG }
  }
  if (normScalar(bracelet.soldDate) !== normScalar(expected.soldDate)) {
    return { ok: false, kind: 'stale', message: STALE_EXCEL_RETRY_MSG }
  }
  if (normScalar(bracelet.returnDate) !== normScalar(expected.returnDate)) {
    return { ok: false, kind: 'stale', message: STALE_EXCEL_RETRY_MSG }
  }
  if (normPrice(bracelet.actualPrice) !== normPrice(expected.actualPrice)) {
    return { ok: false, kind: 'stale', message: STALE_EXCEL_RETRY_MSG }
  }
  if (normScalar(bracelet.orderNo) !== normScalar(expected.orderNo)) {
    return { ok: false, kind: 'stale', message: STALE_EXCEL_RETRY_MSG }
  }

  const expectedTs = normTimestamp(expected.updatedAt)
  const currentTs = normTimestamp(bracelet.updatedAt)
  if (expectedTs != null && currentTs != null && currentTs > expectedTs + 1000) {
    return { ok: false, kind: 'stale', message: STALE_EXCEL_RETRY_MSG }
  }

  return { ok: true }
}
