import {
  type CertIndexEntry,
  fetchCertIndexFromBridge,
} from '../adapters/excel/excel-live.adapter'
import { isExcelBridgeEnabled } from '../config/env'

export type { CertIndexEntry }

export interface CertIndexStatus {
  ready: boolean
  loading: boolean
  count: number
  builtAt: string | null
  workbook: string | null
  message: string
}

let entries: CertIndexEntry[] = []
let ready = false
let loading = false
let builtAt: string | null = null
let workbook: string | null = null
let lastMessage = '索引未加载'

export function getCertIndexStatus(): CertIndexStatus {
  return {
    ready,
    loading,
    count: entries.length,
    builtAt,
    workbook,
    message: loading
      ? '正在从 Excel 读取编号索引…'
      : ready
        ? `编号索引已就绪（${entries.length} 条）`
        : lastMessage,
  }
}

export function searchCertIndex(query: string, limit = 20): CertIndexEntry[] {
  const q = query.trim().toUpperCase()
  if (!q || !ready) return []

  const cap = Math.min(Math.max(limit, 1), 50)
  const prefixHits: CertIndexEntry[] = []
  const containsHits: CertIndexEntry[] = []

  for (const item of entries) {
    if (item.certNo.startsWith(q)) {
      prefixHits.push(item)
      if (prefixHits.length >= cap) return prefixHits
    } else if (item.certNo.includes(q) && prefixHits.length + containsHits.length < cap) {
      containsHits.push(item)
    }
    if (prefixHits.length + containsHits.length >= cap) break
  }

  return [...prefixHits, ...containsHits].slice(0, cap)
}

export async function refreshCertIndex(force = false): Promise<CertIndexStatus> {
  if (!isExcelBridgeEnabled()) {
    ready = false
    entries = []
    lastMessage = 'Excel 桥接未启用'
    return getCertIndexStatus()
  }
  if (loading) return getCertIndexStatus()

  loading = true
  lastMessage = '正在从 Excel 读取编号索引…'
  try {
    const result = await fetchCertIndexFromBridge(force || !ready)
    if (!result.ok || !result.entries) {
      ready = false
      entries = []
      lastMessage = result.message
      return getCertIndexStatus()
    }
    entries = result.entries
    ready = true
    builtAt = result.builtAt ?? new Date().toISOString()
    workbook = result.workbook ?? null
    lastMessage = result.message
    return getCertIndexStatus()
  } finally {
    loading = false
  }
}

/** 启动后延迟预热，桥接未就绪时自动重试 */
export function scheduleCertIndexWarmup(): void {
  if (!isExcelBridgeEnabled()) return

  let attempt = 0
  const maxAttempts = 12

  const tryWarm = async () => {
    attempt += 1
    const status = await refreshCertIndex(attempt > 1)
    if (status.ready) {
      console.log(`[cert-index] 预热完成：${status.count} 条`)
      return
    }
    if (attempt < maxAttempts) {
      setTimeout(tryWarm, 5000)
    } else {
      console.warn(`[cert-index] 预热未完成：${status.message}`)
    }
  }

  setTimeout(tryWarm, 3000)
}
