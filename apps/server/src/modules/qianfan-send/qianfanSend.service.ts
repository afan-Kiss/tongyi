import { prisma } from '../../lib/prisma'
import { createAgentTask } from '../agent/agent-task.service'
import { getAgentOverview } from '../agent/agent.service'
import type { AgentTaskResultBody } from '../agent/agent.types'
import { presentQianfanSendJob } from './qianfanSend.presenter'
import {
  NON_RETRYABLE_ERRORS,
  RETRY_DELAYS_MS,
  RETRYABLE_ERRORS,
  type CreateQianfanImageJobInput,
  type CreateQianfanTextJobInput,
  type QianfanTargetLock,
} from './qianfanSend.types'
import { validateImageJobInput, validateTextJobInput } from './qianfanSend.validator'

function buildTargetLock(input: {
  shopTitle: string
  buyerNick: string
  appCid: string
  receiverAppUids: string[]
  replyId?: number | null
  source: string
}): QianfanTargetLock {
  return {
    shopTitle: input.shopTitle,
    buyerNick: input.buyerNick,
    appCid: input.appCid,
    receiverAppUids: input.receiverAppUids,
    replyId: input.replyId ?? null,
    source: input.source as QianfanTargetLock['source'],
    createdAt: new Date().toISOString(),
  }
}

async function ensureAgentOnline() {
  const agent = await getAgentOverview()
  if (!agent.hasOnlineAgent) {
    throw new Error('本地助手离线，无法创建千帆发送任务')
  }
  return agent
}

async function createJobWithTask(data: {
  source: string
  messageType: 'text' | 'image'
  shopTitle: string
  buyerNick: string
  appCid: string
  receiverAppUids: string[]
  replyId: number | null
  text?: string | null
  imageUrl?: string | null
  imageLocalPath?: string | null
  mediaId?: string | null
  targetLock: QianfanTargetLock
  payloadSummary: Record<string, unknown>
  agentPayload: Record<string, unknown>
  taskType: 'qianfan.sendText' | 'qianfan.sendImage'
}) {
  await ensureAgentOnline()

  const job = await prisma.qianfanSendJob.create({
    data: {
      source: data.source,
      messageType: data.messageType,
      shopTitle: data.shopTitle,
      buyerNick: data.buyerNick,
      appCid: data.appCid,
      receiverAppUidsJson: JSON.stringify(data.receiverAppUids),
      replyId: data.replyId,
      text: data.text,
      imageUrl: data.imageUrl,
      imageLocalPath: data.imageLocalPath,
      mediaId: data.mediaId,
      targetLockJson: JSON.stringify(data.targetLock),
      payloadSummaryJson: JSON.stringify(data.payloadSummary),
      status: 'pending',
    },
  })

  const agentTask = await createAgentTask({
    type: data.taskType,
    payload: { ...data.agentPayload, jobId: job.id, targetLock: data.targetLock },
    maxRetries: 3,
  })

  const linked = await prisma.qianfanSendJob.update({
    where: { id: job.id },
    data: { taskId: agentTask.id, status: 'pending' },
  })

  return presentQianfanSendJob(linked)
}

export async function createTextSendJob(input: CreateQianfanTextJobInput) {
  const v = validateTextJobInput(input)
  const targetLock = buildTargetLock(v)
  const payloadSummary = { type: 'text', textPreview: v.text.slice(0, 120) }
  return createJobWithTask({
    source: v.source,
    messageType: 'text',
    shopTitle: v.shopTitle,
    buyerNick: v.buyerNick,
    appCid: v.appCid,
    receiverAppUids: v.receiverAppUids,
    replyId: v.replyId,
    text: v.text,
    targetLock,
    payloadSummary,
    taskType: 'qianfan.sendText',
    agentPayload: {
      messageType: 'text',
      shopTitle: v.shopTitle,
      buyerNick: v.buyerNick,
      appCid: v.appCid,
      receiverAppUids: v.receiverAppUids,
      replyId: v.replyId,
      text: v.text,
      targetLock,
    },
  })
}

export async function createImageSendJob(input: CreateQianfanImageJobInput) {
  const v = validateImageJobInput(input)
  const targetLock = buildTargetLock(v)
  const payloadSummary = {
    type: 'image',
    imageUrl: v.imageUrl,
    imageLocalPath: v.imageLocalPath,
  }
  return createJobWithTask({
    source: v.source,
    messageType: 'image',
    shopTitle: v.shopTitle,
    buyerNick: v.buyerNick,
    appCid: v.appCid,
    receiverAppUids: v.receiverAppUids,
    replyId: v.replyId,
    imageUrl: v.imageUrl,
    imageLocalPath: v.imageLocalPath,
    mediaId: v.mediaId,
    targetLock,
    payloadSummary,
    taskType: 'qianfan.sendImage',
    agentPayload: {
      messageType: 'image',
      shopTitle: v.shopTitle,
      buyerNick: v.buyerNick,
      appCid: v.appCid,
      receiverAppUids: v.receiverAppUids,
      replyId: v.replyId,
      imageUrl: v.imageUrl,
      imageLocalPath: v.imageLocalPath,
      targetLock,
    },
  })
}

export async function listSendJobs(limit = 50) {
  const rows = await prisma.qianfanSendJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    include: { attempts: { orderBy: { attemptNo: 'desc' }, take: 3 } },
  })
  return rows.map((row) => ({
    ...presentQianfanSendJob(row),
    recentAttempts: row.attempts.map((a) => ({
      attemptNo: a.attemptNo,
      status: a.status,
      errorCode: a.errorCode,
      errorMessage: a.errorMessage,
      finishedAt: a.finishedAt?.toISOString() || null,
    })),
  }))
}

export async function getSendJob(id: string) {
  const row = await prisma.qianfanSendJob.findUnique({
    where: { id },
    include: { attempts: { orderBy: { attemptNo: 'desc' } } },
  })
  if (!row) throw new Error('发送任务不存在')
  return {
    ...presentQianfanSendJob(row),
    attempts: row.attempts.map((a) => ({
      id: a.id,
      attemptNo: a.attemptNo,
      status: a.status,
      errorCode: a.errorCode,
      errorMessage: a.errorMessage,
      startedAt: a.startedAt.toISOString(),
      finishedAt: a.finishedAt?.toISOString() || null,
    })),
  }
}

export async function retrySendJob(id: string) {
  const job = await prisma.qianfanSendJob.findUnique({ where: { id } })
  if (!job) throw new Error('发送任务不存在')
  if (!['failed', 'dead_letter', 'retrying'].includes(job.status)) {
    throw new Error('当前状态不可重试')
  }
  if (job.errorCode && NON_RETRYABLE_ERRORS.has(job.errorCode)) {
    throw new Error('目标不匹配类错误不可重试')
  }

  await ensureAgentOnline()
  const targetLock = JSON.parse(job.targetLockJson)
  const taskType = job.messageType === 'image' ? 'qianfan.sendImage' : 'qianfan.sendText'
  const agentTask = await createAgentTask({
    type: taskType,
    payload: {
      jobId: job.id,
      messageType: job.messageType,
      shopTitle: job.shopTitle,
      buyerNick: job.buyerNick,
      appCid: job.appCid,
      receiverAppUids: JSON.parse(job.receiverAppUidsJson || '[]'),
      replyId: job.replyId,
      text: job.text,
      imageUrl: job.imageUrl,
      imageLocalPath: job.imageLocalPath,
      targetLock,
    },
    maxRetries: 3,
  })

  const updated = await prisma.qianfanSendJob.update({
    where: { id },
    data: {
      taskId: agentTask.id,
      status: 'pending',
      errorCode: null,
      errorMessage: null,
      nextRetryAt: null,
      finishedAt: null,
    },
  })
  return presentQianfanSendJob(updated)
}

export async function cancelSendJob(id: string) {
  const job = await prisma.qianfanSendJob.findUnique({ where: { id } })
  if (!job) throw new Error('发送任务不存在')
  if (job.status === 'sent') throw new Error('已发送任务不能取消')
  const updated = await prisma.qianfanSendJob.update({
    where: { id },
    data: { status: 'cancelled', finishedAt: new Date() },
  })
  return presentQianfanSendJob(updated)
}

function classifyErrorCode(message: string, result?: Record<string, unknown>): string {
  const code = String(result?.errorCode || result?.code || '').trim()
  if (code) return code
  const msg = message.toLowerCase()
  if (msg.includes('target') || msg.includes('不匹配')) return 'target_mismatch'
  if (msg.includes('ack') || msg.includes('确认')) return 'ack_timeout'
  if (msg.includes('websocket') || msg.includes('ws')) return 'ws_not_ready'
  if (msg.includes('cdp') || msg.includes('devtools')) return 'cdp_not_ready'
  if (msg.includes('timeout') || msg.includes('超时')) return 'local_api_timeout'
  if (msg.includes('econnrefused') || msg.includes('fetch')) return 'qianfan_not_running'
  if (msg.includes('network')) return 'network_error'
  return 'network_error'
}

export async function handleQianfanAgentTaskResult(
  taskId: string,
  taskType: string,
  body: AgentTaskResultBody,
) {
  if (!taskType.startsWith('qianfan.send')) return

  const job = await prisma.qianfanSendJob.findFirst({ where: { taskId } })
  if (!job) return

  const result = body.result || {}
  const errorCode = classifyErrorCode(body.errorMessage || '', result)
  const attemptNo = job.attemptCount + 1

  if (body.status === 'success') {
    const ackMsgId = String(result.ackMsgId || result.msgId || '')
    const qianfanMsgId = String(result.qianfanMsgId || result.messageId || '')
    if (!ackMsgId && !qianfanMsgId) {
      await recordAttempt(job.id, attemptNo, 'failed', 'ack_timeout', '千帆未返回确认 ID', {}, result)
      await scheduleOrFail(job.id, 'ack_timeout', '千帆没有确认收到', attemptNo)
      return
    }
    await recordAttempt(job.id, attemptNo, 'sent', null, null, {}, result, { ackMsgId, qianfanMsgId })
    await prisma.qianfanSendJob.update({
      where: { id: job.id },
      data: {
        status: 'sent',
        ackMsgId: ackMsgId || null,
        qianfanMsgId: qianfanMsgId || null,
        attemptCount: attemptNo,
        sentAt: new Date(),
        finishedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    })
    return
  }

  const retryable =
    body.status === 'retryable_failed' &&
    RETRYABLE_ERRORS.has(errorCode) &&
    !NON_RETRYABLE_ERRORS.has(errorCode)

  await recordAttempt(job.id, attemptNo, 'failed', errorCode, body.errorMessage || null, {}, result)

  if (NON_RETRYABLE_ERRORS.has(errorCode)) {
    await prisma.qianfanSendJob.update({
      where: { id: job.id },
      data: {
        status: errorCode === 'target_mismatch' ? 'target_blocked' : 'failed',
        errorCode,
        errorMessage: body.errorMessage,
        attemptCount: attemptNo,
        finishedAt: new Date(),
      },
    })
    return
  }

  await scheduleOrFail(job.id, errorCode, body.errorMessage || '发送失败', attemptNo, retryable)
}

async function recordAttempt(
  jobId: string,
  attemptNo: number,
  status: string,
  errorCode: string | null,
  errorMessage: string | null,
  request: Record<string, unknown>,
  response: Record<string, unknown>,
  ack?: { ackMsgId?: string; qianfanMsgId?: string },
) {
  await prisma.qianfanSendAttempt.create({
    data: {
      jobId,
      attemptNo,
      status,
      errorCode,
      errorMessage,
      requestJson: JSON.stringify(request),
      responseJson: JSON.stringify(response),
      ackJson: JSON.stringify(ack || {}),
      finishedAt: new Date(),
    },
  })
}

async function scheduleOrFail(
  jobId: string,
  errorCode: string,
  errorMessage: string,
  attemptNo: number,
  retryable = true,
) {
  const job = await prisma.qianfanSendJob.findUnique({ where: { id: jobId } })
  if (!job) return

  if (!retryable || attemptNo >= job.maxAttempts) {
    await prisma.qianfanSendJob.update({
      where: { id: jobId },
      data: {
        status: attemptNo >= job.maxAttempts ? 'dead_letter' : 'failed',
        errorCode,
        errorMessage,
        attemptCount: attemptNo,
        finishedAt: new Date(),
      },
    })
    return
  }

  const delay = RETRY_DELAYS_MS[Math.min(attemptNo - 1, RETRY_DELAYS_MS.length - 1)]
  const nextRetryAt = new Date(Date.now() + delay)
  await prisma.qianfanSendJob.update({
    where: { id: jobId },
    data: {
      status: 'retrying',
      errorCode,
      errorMessage,
      attemptCount: attemptNo,
      nextRetryAt,
    },
  })
}

export async function markJobClaimed(taskId: string) {
  const job = await prisma.qianfanSendJob.findFirst({ where: { taskId } })
  if (!job || job.status === 'sent' || job.status === 'cancelled') return
  await prisma.qianfanSendJob.update({
    where: { id: job.id },
    data: { status: job.status === 'pending' ? 'claimed' : job.status },
  })
}
