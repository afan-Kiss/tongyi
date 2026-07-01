import type { QianfanApiError, QianfanApiResult } from './qianfanSync.types'

const DEFAULT_TIMEOUT_MS = 12_000

export async function qianfanFetchJson<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<QianfanApiResult<T>> {
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return {
        ok: false,
        error: {
          code: 'INVALID_JSON',
          message: `千帆后台返回异常（HTTP ${res.status}）`,
          httpStatus: res.status,
        },
      }
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: {
          code: 'COOKIE_INVALID',
          message: 'Cookie 不可用，请先打开千帆客服台或重新采集',
          httpStatus: res.status,
        },
      }
    }

    if (!res.ok) {
      const msg =
        typeof data === 'object' && data && 'msg' in data
          ? String((data as { msg?: string }).msg || '')
          : ''
      return {
        ok: false,
        error: {
          code: 'HTTP_ERROR',
          message: msg || `千帆后台暂时访问失败（HTTP ${res.status}），稍后再试`,
          httpStatus: res.status,
          retryable: res.status >= 500,
        },
      }
    }

    const body = data as Record<string, unknown>
    if (body.success === false || (typeof body.code === 'number' && body.code !== 0 && body.code !== 200)) {
      return {
        ok: false,
        error: {
          code: 'API_ERROR',
          message: String(body.msg || body.message || '千帆接口返回失败'),
          httpStatus: res.status,
        },
      }
    }

    return { ok: true, data: data as T }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const isTimeout = /timeout|aborted/i.test(msg)
    return {
      ok: false,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'NETWORK',
        message: isTimeout ? '千帆后台请求超时，稍后再试' : '网络异常，无法连接千帆后台',
        retryable: true,
      },
    }
  }
}

export function unwrapData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  if (obj.data != null) return obj.data as T
  return payload as T
}

export function toApiError(err: QianfanApiError | undefined, fallback: string): string {
  return err?.message || fallback
}
