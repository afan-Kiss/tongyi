import type { NextFunction, Request, Response } from 'express'
import { getCachedLicense } from '../services/youdaoLicense.service'

const PUBLIC_V1_PREFIXES = ['/health', '/auth', '/photo-relay']

export function isPublicV1Path(path: string, originalUrl?: string): boolean {
  const paths = [path, originalUrl?.split('?')[0] || ''].filter(Boolean)
  return paths.some((p) =>
    PUBLIC_V1_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`)),
  )
}

function rejectIfLicenseDisabled(res: Response): boolean {
  const license = getCachedLicense()
  if (license.allowed) return false
  res.status(403).json({
    ok: false,
    message: license.message || '软件不可用',
    code: 'LICENSE_DISABLED',
  })
  return true
}

export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  if (isPublicV1Path(req.path, req.originalUrl)) {
    next()
    return
  }
  if (rejectIfLicenseDisabled(res)) return
  if (req.session?.authed) {
    next()
    return
  }
  res.status(401).json({ ok: false, message: '请先登录' })
}

export function requireSessionAuth(req: Request, res: Response, next: NextFunction): void {
  if (rejectIfLicenseDisabled(res)) return
  if (req.session?.authed) {
    next()
    return
  }
  res.status(401).json({ ok: false, message: '请先登录' })
}
