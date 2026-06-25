/**
 * 启动/运行时从有道云分享笔记读取「扫码枪系统」开关（与辅助出库软件同源笔记）。
 * [扫码枪系统]=开 → 可用；=关 → 不可用。网络异常时默认放行。
 */
const YOUDAO_SHARE_KEY = String(process.env.YOUDAO_SHARE_KEY || '59fb59203600e841c444d96bad36d3e4').trim()
const YOUDAO_SHARE_API = 'https://note.youdao.com/yws/api/personal/share'

export const SCAN_GUN_SWITCH_FIELD = '扫码枪系统'
export const LICENSE_DISABLED_MESSAGE = '软件不可用，请联系17364583794 同V'

const REQUEST_TIMEOUT_MS = 12_000
const STARTUP_REQUEST_TIMEOUT_MS = 1_500
const CACHE_TTL_MS = 60_000

const SWITCH_RE = new RegExp(
  `(?:\\[)?${SCAN_GUN_SWITCH_FIELD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\])?\\s*=\\s*(开|关)`,
)

export interface LicenseStatus {
  allowed: boolean
  message: string
  switchValue: '开' | '关' | null
  fromCache: boolean
}

let cache: { status: LicenseStatus; at: number } | null = null
let refreshPromise: Promise<LicenseStatus> | null = null

export function parseScanGunSwitchValue(text: string): '开' | '关' | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const m = SWITCH_RE.exec(raw)
  return m?.[1] === '开' || m?.[1] === '关' ? (m[1] as '开' | '关') : null
}

export function isScanGunSystemDisabled(text: string): boolean {
  return parseScanGunSwitchValue(text) === '关'
}

export async function fetchShareSummary(
  shareKey: string = YOUDAO_SHARE_KEY,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<string> {
  const url = `${YOUDAO_SHARE_API}?method=get&shareKey=${encodeURIComponent(shareKey)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`有道云 HTTP ${res.status}`)
  const data = (await res.json()) as { entry?: { summary?: unknown } }
  const summary = data?.entry?.summary
  if (typeof summary === 'string' && summary.trim()) return summary.trim()
  throw new Error('有道云笔记未返回可用摘要')
}

function buildStatusFromSummary(summary: string): LicenseStatus {
  const switchValue = parseScanGunSwitchValue(summary)
  if (switchValue === '关') {
    return { allowed: false, message: LICENSE_DISABLED_MESSAGE, switchValue, fromCache: false }
  }
  return { allowed: true, message: '', switchValue, fromCache: false }
}

function allowOnCheckFailure(reason: string): LicenseStatus {
  console.warn('[license] 有道云许可检查失败，默认放行：%s', reason)
  return { allowed: true, message: '', switchValue: null, fromCache: false }
}

export async function checkStartupLicense(options?: {
  shareKey?: string
  timeoutMs?: number
  force?: boolean
}): Promise<LicenseStatus> {
  if (process.env.LICENSE_CHECK_DISABLED === 'true') {
    return { allowed: true, message: '', switchValue: '开', fromCache: false }
  }

  const shareKey = options?.shareKey || YOUDAO_SHARE_KEY
  const timeoutMs = options?.timeoutMs ?? STARTUP_REQUEST_TIMEOUT_MS
  const force = options?.force === true

  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.status, fromCache: true }
  }

  if (!force && refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const summary = await fetchShareSummary(shareKey, timeoutMs)
      const switchValue = parseScanGunSwitchValue(summary)
      if (switchValue === null) {
        console.warn('[license] 有道云笔记未找到「%s」开关：%s', SCAN_GUN_SWITCH_FIELD, summary)
        const status = allowOnCheckFailure('未找到开关')
        cache = { status, at: Date.now() }
        return status
      }
      const status = buildStatusFromSummary(summary)
      cache = { status, at: Date.now() }
      if (!status.allowed) {
        console.warn('[license] 「%s」=关，系统已禁用', SCAN_GUN_SWITCH_FIELD)
      }
      return status
    } catch (err) {
      const status = allowOnCheckFailure(err instanceof Error ? err.message : String(err))
      cache = { status, at: Date.now() }
      return status
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function getCachedLicense(): LicenseStatus {
  if (cache) return { ...cache.status, fromCache: true }
  return { allowed: true, message: '', switchValue: null, fromCache: true }
}

export function scheduleLicenseRefresh(intervalMs = CACHE_TTL_MS): void {
  const tick = () => {
    void checkStartupLicense({ force: true, timeoutMs: REQUEST_TIMEOUT_MS })
  }
  setInterval(tick, intervalMs)
}
