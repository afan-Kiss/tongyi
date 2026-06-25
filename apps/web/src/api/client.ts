import { PrintRequestError } from '@/lib/formatPrintError'

const API_V1 = '/api/v1'
export const DEFAULT_TIMEOUT_MS = 20_000
export const PRINT_TIMEOUT_MS = 60_000

function isTimeoutError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const msg = e.message.toLowerCase()
  return e.name === 'TimeoutError' || msg.includes('timed out') || msg.includes('abort')
}

function timeoutErrorMessage(path: string): string {
  if (path.includes('/print/')) {
    return '打印请求超时：系统已尝试自动重启打印服务，请确认璞趣桌面与 PUQU 打印机正常后重试'
  }
  return '请求超时，请稍后重试'
}

/** 401 时先触发校验，由 AuthContext 调 /auth/status 确认后再决定是否登出 */
export function notifyAuthCheck() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('auth:check'))
  }
}

function notifyLicenseBlocked(detail: { allowed: boolean; message: string }) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('license:blocked', { detail }))
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${API_V1}${path}`, {
      credentials: 'include',
      signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 403 && data?.code === 'LICENSE_DISABLED') {
      notifyLicenseBlocked({
        allowed: false,
        message: String(data.message || '软件不可用'),
      })
      throw new Error(String(data.message || '软件不可用'))
    }
    if (res.status === 401 && !path.startsWith('/auth/')) {
      notifyAuthCheck()
      throw new Error(String(data.message || '请先登录'))
    }
    if (!res.ok || data.ok === false) {
      const message = String(data.message || `请求失败 ${res.status}`)
      const solutions = Array.isArray(data.solutions)
        ? (data.solutions as string[]).filter((s) => typeof s === 'string' && s.trim())
        : undefined
      if (path.includes('/print/')) {
        throw new PrintRequestError(message, solutions)
      }
      throw new Error(message)
    }
    return data
  } catch (e) {
    if (e instanceof PrintRequestError) throw e
    if (isTimeoutError(e)) {
      if (path.includes('/print/')) throw new PrintRequestError(timeoutErrorMessage(path))
      throw new Error(timeoutErrorMessage(path))
    }
    throw e
  }
}

/** 手机拍照 relay：无需登录 cookie，避免手机端被许可/会话校验拖死 */
export async function publicRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_V1}${path}`, {
    signal: init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(String(data.message || `请求失败 ${res.status}`))
  }
  return data
}

export async function upload(path: string, formData: FormData) {
  const res = await fetch(`${API_V1}${path}`, {
    method: 'POST',
    credentials: 'include',
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 403 && data?.code === 'LICENSE_DISABLED') {
    notifyLicenseBlocked({
      allowed: false,
      message: String(data.message || '软件不可用'),
    })
    throw new Error(String(data.message || '软件不可用'))
  }
  if (res.status === 401) {
    notifyAuthCheck()
    throw new Error(String(data.message || '请先登录'))
  }
  if (!res.ok || !data.ok) throw new Error(String(data.message || '上传失败'))
  return data
}
