import type { AppSettings, SystemStatus } from '@/api/types'

export function pickLanIp(ips: string[]): string | null {
  if (!ips.length) return null
  const score = (ip: string) => {
    if (/^192\.168\.240\./.test(ip)) return 90
    if (/^169\.254\./.test(ip)) return 91
    if (ip.startsWith('192.168.0.')) return 0
    if (ip.startsWith('192.168.1.')) return 1
    if (ip.startsWith('192.168.')) return 2
    if (ip.startsWith('10.')) return 3
    if (ip.startsWith('172.')) return 4
    return 5
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

function isPrivateLanHost(hostname: string): boolean {
  if (isLocalHost(hostname)) return true
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return (
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    )
  }
  return false
}

function mobileCameraPath(sessionId: string): string {
  return `/inventory/mobile-camera?s=${encodeURIComponent(sessionId)}`
}

function publicHttpsBase(settings?: Pick<AppSettings, 'publicUrl'> | null): string | null {
  const pub = normalizeBaseUrl(settings?.publicUrl || '')
  if (!pub.startsWith('https://')) return null
  try {
    const host = new URL(pub).hostname
    if (!host || isLocalHost(host) || isPrivateLanHost(host)) return null
    return pub.replace(/\/$/, '')
  } catch {
    return null
  }
}

function lanHttpsUrl(lanIp: string, httpsPort: number, path: string): string {
  return `https://${lanIp}:${httpsPort}${path}`
}

function resolveLanIp(
  status?: Pick<SystemStatus, 'lanIps'> | null,
  settings?: Pick<AppSettings, 'lanUrls'> | null,
): string | null {
  return pickLanIp(status?.lanIps || []) || pickLanIp(settings?.lanUrls || [])
}

/**
 * 手机拍照页 URL（客户端兜底；优先使用服务端 /photo-relay/station 返回的 mobileUrl）。
 * 同 WiFi 优先内网自签 HTTPS（4730）；禁止给手机生成 127.0.0.1 链接。
 */
export function buildMobileCameraUrl(
  sessionId: string,
  settings?: Pick<AppSettings, 'publicUrl' | 'lanUrls'> | null,
  status?: Pick<SystemStatus, 'lanIps' | 'port' | 'mobileHttpsPort'> | null,
): string {
  const path = mobileCameraPath(sessionId)
  const lanIp = resolveLanIp(status, settings)
  const httpsPort = status?.mobileHttpsPort || (lanIp ? 4730 : 0)
  const pubHttps = publicHttpsBase(settings)
  const httpPort = status?.port || 4725

  if (lanIp && httpsPort > 0) {
    return lanHttpsUrl(lanIp, httpsPort, path)
  }

  if (pubHttps) {
    return `${pubHttps}${path}`
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname, origin } = window.location
    if (protocol === 'https:' && hostname && !isLocalHost(hostname)) {
      return `${origin}${path}`
    }
  }

  if (lanIp) {
    return `http://${lanIp}:${httpPort}${path}`
  }

  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  if (host && !isLocalHost(host)) {
    const originPort = (typeof window !== 'undefined' && window.location.port) || String(httpPort)
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return `https://${host}:${originPort}${path}`
    }
    return `http://${host}:${originPort}${path}`
  }

  const pub = normalizeBaseUrl(settings?.publicUrl || '')
  if (pub) return `${pub.replace(/\/$/, '')}${path}`

  return path
}

/** 公网域名 HTTPS（非自签 IP） */
export function isPublicHttpsMobileCameraUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return !isLocalHost(u.hostname) && !isPrivateLanHost(u.hostname)
  } catch {
    return false
  }
}

/** HTTPS 拍照地址（可开摄像头） */
export function isSecureMobileCameraUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return isLocalHost(u.hostname) || !isPrivateLanHost(u.hostname) || u.port === '4730'
  } catch {
    return false
  }
}

/** 内网自签 HTTPS（4730） */
export function isSecureLanMobileCameraUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    const host = u.hostname
    if (isLocalHost(host)) return true
    return isPrivateLanHost(host)
  } catch {
    return false
  }
}

export function isHttpMobileCameraUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'http:'
  } catch {
    return false
  }
}

/** @deprecated 使用 isSecureLanMobileCameraUrl */
export function isLanMobileCameraUrl(url: string): boolean {
  return (
    isSecureLanMobileCameraUrl(url) ||
    (() => {
      try {
        const u = new URL(url)
        return u.protocol === 'http:' && !isLocalHost(u.hostname) && isPrivateLanHost(u.hostname)
      } catch {
        return false
      }
    })()
  )
}
