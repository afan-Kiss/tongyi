import type { AppSettings, SystemStatus } from '@/api/types'

function pickLanIp(ips: string[]): string | null {
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

/** 手机拍照页 URL（优先 HTTPS 外网，否则内网 IP） */
export function buildMobileCameraUrl(
  sessionId: string,
  settings?: Pick<AppSettings, 'publicUrl'> | null,
  status?: Pick<SystemStatus, 'lanIps' | 'port'> | null,
): string {
  const path = `/inventory/mobile-camera?s=${encodeURIComponent(sessionId)}`
  const pub = normalizeBaseUrl(settings?.publicUrl || '')
  if (pub.startsWith('https://')) return `${pub}${path}`
  const lanIp = pickLanIp(status?.lanIps || [])
  const port = status?.port || window.location.port || '4725'
  if (lanIp) return `http://${lanIp}:${port}${path}`
  return `${window.location.origin}${path}`
}
