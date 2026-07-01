import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  cancelSendJob,
  createImageSendJob,
  createTextSendJob,
  getSendJob,
  listSendJobs,
  retrySendJob,
} from './qianfanSend.service'

export const qianfanSendRouter = Router()

qianfanSendRouter.post('/text', async (req, res) => {
  try {
    const job = await createTextSendJob(req.body || {})
    sendOk(res, job, '已创建文字发送任务，等待本地助手执行')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建失败', 400)
  }
})

qianfanSendRouter.post('/image', async (req, res) => {
  try {
    const job = await createImageSendJob(req.body || {})
    sendOk(res, job, '已创建图片发送任务，等待本地助手执行')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建失败', 400)
  }
})

qianfanSendRouter.get('/jobs', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50
    sendOk(res, { jobs: await listSendJobs(limit) })
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '查询失败', 500)
  }
})

qianfanSendRouter.get('/jobs/:id', async (req, res) => {
  try {
    sendOk(res, await getSendJob(req.params.id))
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '查询失败', 404)
  }
})

qianfanSendRouter.post('/jobs/:id/retry', async (req, res) => {
  try {
    const job = await retrySendJob(req.params.id)
    sendOk(res, job, '已重新排队')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '重试失败', 400)
  }
})

qianfanSendRouter.post('/jobs/:id/cancel', async (req, res) => {
  try {
    const job = await cancelSendJob(req.params.id)
    sendOk(res, job, '已取消')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '取消失败', 400)
  }
})
