import type { AppSettings, SystemStatus } from '@/api/types'

export function pickLanIp(ips: string[]): string | null {
  if (!ips.length) return null
  const score = (ip: string) => {
    if (ip.startsWith('192.168.')) return 0
    if (ip.startsWith('10.')) return 1
    if (ip.startsWith('172.')) return 3
    return 2
  }
  return [...ips].sort((a, b) => score(a) - score(b))[0] ?? null
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/duckdns\.org/i.test(trimmed)) return `https://${trimmed}`
  return `http://${trimmed}`
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * 手机拍照页 URL。
 * 手机 getUserMedia 必须 HTTPS（或 localhost），内网优先本机 HTTPS 端口（4730）。
 */
export function buildMobileCameraUrl(
  sessionId: string,
  settings?: Pick<AppSettings, 'publicUrl'> | null,
  status?: Pick<SystemStatus, 'lanIps' | 'port' | 'mobileHttpsPort'> | null,
): string {
  const path = `/inventory/mobile-camera?s=${encodeURIComponent(sessionId)}`
  const lanIp = pickLanIp(status?.lanIps || [])
  const httpsPort = status?.mobileHttpsPort || 0

  if (lanIp && httpsPort > 0) {
    return `https://${lanIp}:${httpsPort}${path}`
  }

  const pub = normalizeBaseUrl(settings?.publicUrl || '')
  if (pub.startsWith('https://')) {
    return `${pub}${path}`
  }

  const port = status?.port || window.location.port || '4725'
  if (lanIp) {
    return `http://${lanIp}:${port}${path}`
  }

  const host = window.location.hostname
  if (host && !isLocalHost(host)) {
    const originPort = window.location.port || port
    if (window.location.protocol === 'https:') {
      return `https://${host}:${originPort}${path}`
    }
    return `http://${host}:${originPort}${path}`
  }

  if (pub) return `${pub}${path}`

  return `${window.location.origin}${path}`
}

/** 内网 HTTPS 拍照地址（可实时预览） */
export function isSecureLanMobileCameraUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname
    if (isLocalHost(host)) return true
    if (/duckdns\.org/i.test(host)) return false
    return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('192.168.') || host.startsWith('10.')
  } catch {
    return false
  }
}

/** @deprecated 使用 isSecureLanMobileCameraUrl */
export function isLanMobileCameraUrl(url: string): boolean {
  return isSecureLanMobileCameraUrl(url) || (() => {
    try {
      const u = new URL(url)
      return u.protocol === 'http:' && !isLocalHost(u.hostname) && !/duckdns\.org/i.test(u.hostname)
    } catch {
      return false
    }
  })()
}
