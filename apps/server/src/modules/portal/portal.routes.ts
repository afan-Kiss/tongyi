import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import { getPortalOverview } from './portal.service'

export const portalRouter = Router()

portalRouter.get('/overview', async (_req, res) => {
  try {
    const overview = await getPortalOverview()
    sendOk(res, overview)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取总览失败', 500)
  }
})
