import type { NextFunction, Request, Response } from 'express'
import { getCachedLicense } from '../services/youdaoLicense.service'

const PUBLIC_V1_PREFIXES = ['/health', '/auth', '/photo-relay', '/agent/register']

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

/** 祥钰 iframe 内 /api 请求：已带 session cookie 但 authed 尚未加载时，避免误报「请先登录」 */
function sessionAuthed(req: Request): boolean {
  return Boolean(req.session?.authed)
}

function rejectSessionRequired(req: Request, res: Response, forXiangyu = false): boolean {
  if (sessionAuthed(req)) return false
  const hasCookie = Boolean(req.sessionID && req.headers.cookie?.includes('jade.sid'))
  res.status(401).json({
    ok: false,
    message: hasCookie && forXiangyu
      ? '登录状态同步中，请稍候再刷新'
      : '请先登录本系统（出库入库页右上角已登录即可，无需另注册）',
    code: 'AUTH_REQUIRED',
  })
  return true
}

export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  if (isPublicV1Path(req.path, req.originalUrl)) {
    next()
    return
  }
  const original = req.originalUrl?.split('?')[0] || ''
  const agentSelfAuth =
    original.startsWith('/api/v1/agent/heartbeat') ||
    original.startsWith('/api/v1/agent/tasks/pull') ||
    /\/api\/v1\/agent\/tasks\/[^/]+\/result/.test(original)
  if (agentSelfAuth) {
    next()
    return
  }
  if (rejectIfLicenseDisabled(res)) return
  if (sessionAuthed(req)) {
    next()
    return
  }
  if (rejectSessionRequired(req, res)) return
  next()
}

export function requireSessionAuth(req: Request, res: Response, next: NextFunction): void {
  if (rejectIfLicenseDisabled(res)) return
  if (sessionAuthed(req)) {
    next()
    return
  }
  const forXiangyu =
    req.path.startsWith('/xiangyu-proxy') ||
    (req.path.startsWith('/api') && !req.path.startsWith('/api/v1'))
  if (rejectSessionRequired(req, res, forXiangyu)) return
  next()
}
