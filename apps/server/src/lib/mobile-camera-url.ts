import { getMobileHttpsPort, getPort } from '../config/env'
import { isMobileHttpsEnabled } from './mobile-https'
import { getLanIps } from '../services/settings.service'

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

function normalizePublicUrl(raw: string): string {
  const trimmed = String(raw || '').trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/duckdns\.org/i.test(trimmed)) return `https://${trimmed}`
  return `http://${trimmed}`
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function mobileCameraPath(sessionId: string): string {
  return `/inventory/mobile-camera?s=${encodeURIComponent(sessionId)}`
}

/** 服务端生成手机拍照页 URL（权威来源，避免客户端误用 127.0.0.1） */
export function buildMobileCameraUrl(sessionId: string, publicUrl?: string): string {
  const path = mobileCameraPath(sessionId)
  const lanIp = pickLanIp(getLanIps())
  const httpsPort = isMobileHttpsEnabled() ? getMobileHttpsPort() : 0
  const httpPort = getPort()

  if (lanIp && httpsPort > 0) {
    return `https://${lanIp}:${httpsPort}${path}`
  }

  const pub = normalizePublicUrl(publicUrl || '')
  if (pub.startsWith('https://')) {
    try {
      const host = new URL(pub).hostname
      if (host && !isLocalHost(host)) return `${pub}${path}`
    } catch {
      /* ignore */
    }
  }

  if (lanIp) {
    return `http://${lanIp}:${httpPort}${path}`
  }

  if (pub) return `${pub}${path}`

  return `http://127.0.0.1:${httpPort}${path}`
}

export function getMobileCameraNetworkInfo() {
  return {
    lanIps: getLanIps(),
    port: getPort(),
    mobileHttpsPort: isMobileHttpsEnabled() ? getMobileHttpsPort() : 0,
    mobileHttpsEnabled: isMobileHttpsEnabled(),
  }
}
