import type { Request } from 'express'

export function getClientIp(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    ?.trim()
  if (forwarded) return forwarded
  return req.ip || req.socket.remoteAddress || ''
}

export function getClientUserAgent(req: Request): string {
  return String(req.headers['user-agent'] || '').slice(0, 512)
}
