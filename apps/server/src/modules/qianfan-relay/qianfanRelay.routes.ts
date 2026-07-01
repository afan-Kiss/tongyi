import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import { upsertQianfanRelayStatusSnapshot } from './qianfanRelay.status'
import {
  diagnoseQianfanRelay,
  readQianfanLogs,
  readQianfanMessages,
  readQianfanNotifications,
} from './qianfanRelay.diagnose'
import {
  enqueueQianfanRestart,
  enqueueQianfanSendImage,
  enqueueQianfanSendText,
  enqueueQianfanStart,
  enqueueQianfanStop,
} from './qianfanRelay.send'

export const qianfanRelayRouter = Router()

qianfanRelayRouter.get('/status', async (_req, res) => {
  try {
    const snapshot = await upsertQianfanRelayStatusSnapshot()
    sendOk(res, snapshot)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取千帆状态失败', 500)
  }
})

qianfanRelayRouter.post('/start', async (req, res) => {
  try {
    const result = await enqueueQianfanStart(req.body?.machineId)
    sendOk(res, result, result.message)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建启动任务失败', 400)
  }
})

qianfanRelayRouter.post('/stop', async (req, res) => {
  try {
    const result = await enqueueQianfanStop(req.body?.machineId)
    sendOk(res, result, result.message)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建停止任务失败', 400)
  }
})

qianfanRelayRouter.post('/restart', async (req, res) => {
  try {
    const result = await enqueueQianfanRestart(req.body?.machineId)
    sendOk(res, result, result.message)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建重启任务失败', 400)
  }
})

qianfanRelayRouter.post('/diagnose', async (_req, res) => {
  try {
    const result = await diagnoseQianfanRelay()
    sendOk(res, result)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '诊断失败', 500)
  }
})

qianfanRelayRouter.get('/messages', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100)
    const data = await readQianfanMessages(limit)
    sendOk(res, data)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取消息失败', 500)
  }
})

qianfanRelayRouter.get('/notifications', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100)
    const data = await readQianfanNotifications(limit)
    sendOk(res, data)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取通知失败', 500)
  }
})

qianfanRelayRouter.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const data = await readQianfanLogs(limit)
    sendOk(res, data)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取日志失败', 500)
  }
})

qianfanRelayRouter.post('/send-text', async (req, res) => {
  try {
    const result = await enqueueQianfanSendText(req.body || {})
    sendOk(res, result, result.message)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '发送任务创建失败', 400)
  }
})

qianfanRelayRouter.post('/send-image', async (req, res) => {
  try {
    const result = await enqueueQianfanSendImage(req.body || {})
    sendOk(res, result, result.message)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '发送任务创建失败', 400)
  }
})
