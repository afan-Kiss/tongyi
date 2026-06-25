import type { NextFunction, Request, Response } from 'express'
import { isAuditViewer } from '../services/user-activity.service'
import { sendErr } from '../utils/api-response'

export function requireFanfan(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.authed) {
    sendErr(res, '请先登录', 401)
    return
  }
  if (!isAuditViewer(req.session.username)) {
    sendErr(res, '仅 fanfan 账号可查看操作日志', 403, 'AUDIT_FORBIDDEN')
    return
  }
  next()
}
