import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import { applyDiscoveredPaths, scanSiblingSystems } from './systemDiscovery.service'

export const systemDiscoveryRouter = Router()

systemDiscoveryRouter.get('/siblings', async (_req, res) => {
  try {
    const result = await scanSiblingSystems()
    sendOk(res, result)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '扫描失败', 500)
  }
})

systemDiscoveryRouter.post('/apply', async (req, res) => {
  try {
    const result = await applyDiscoveredPaths(req.body || {})
    sendOk(res, result, '路径已应用')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '应用失败', 400)
  }
})
