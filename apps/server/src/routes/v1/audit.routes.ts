import { Router } from 'express'
import { requireFanfan } from '../../middleware/requireFanfan'
import { listUserActivities, recordUserActivitiesBatch } from '../../services/user-activity.service'
import { sendErr, sendOk } from '../../utils/api-response'

/** 任意已登录用户上报前端行为（点击、页面切换） */
export const auditIngestRouter = Router()

auditIngestRouter.post('/events', async (req, res) => {
  if (!req.session?.authed) {
    return sendErr(res, '请先登录', 401)
  }
  const events = Array.isArray(req.body?.events) ? req.body.events : []
  if (!events.length) {
    return sendOk(res, { accepted: 0 })
  }
  const accepted = await recordUserActivitiesBatch(req, events)
  sendOk(res, { accepted })
})

/** 仅 fanfan 可查看 */
export const auditRouter = Router()

auditRouter.use(requireFanfan)

auditRouter.get('/logs', async (req, res) => {
  const data = await listUserActivities({
    page: Number(req.query.page),
    pageSize: Number(req.query.pageSize),
    username: String(req.query.username || ''),
    category: String(req.query.category || ''),
    q: String(req.query.q || ''),
    from: String(req.query.from || ''),
    to: String(req.query.to || ''),
  })
  sendOk(res, data)
})
