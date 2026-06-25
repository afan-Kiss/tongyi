import type { NextFunction, Request, Response } from 'express'
import {
  buildApiAuditAction,
  recordUserActivityFromRequest,
  shouldSkipApiAuditLog,
} from '../services/user-activity.service'

export function auditApiLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const username = req.session?.username
  if (!username) {
    next()
    return
  }

  const apiPath = req.path || req.url.split('?')[0] || ''
  if (shouldSkipApiAuditLog(req.method, apiPath)) {
    next()
    return
  }

  res.on('finish', () => {
    recordUserActivityFromRequest(req, {
      category: 'api',
      action: buildApiAuditAction(req.method, apiPath, res.statusCode),
      path: apiPath,
      detail: {
        method: req.method,
        status: res.statusCode,
        query: req.query,
      },
    })
  })

  next()
}
