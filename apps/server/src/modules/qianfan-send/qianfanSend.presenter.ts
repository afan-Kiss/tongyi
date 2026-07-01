import type { QianfanSendJob } from '@prisma/client'
import { ERROR_PLAIN, STATUS_LABELS } from './qianfanSend.types'

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function presentQianfanSendJob(row: QianfanSendJob) {
  const statusLabel = STATUS_LABELS[row.status] || row.status
  const plainError = row.errorCode ? ERROR_PLAIN[row.errorCode] || row.errorMessage : row.errorMessage
  const targetLock = parseJson(row.targetLockJson, {})
  const payloadSummary = parseJson(row.payloadSummaryJson, {})
  const receiverAppUids = parseJson<string[]>(row.receiverAppUidsJson, [])
  const flow = buildStatusFlow(row.status)

  return {
    id: row.id,
    taskId: row.taskId,
    source: row.source,
    messageType: row.messageType,
    shopTitle: row.shopTitle,
    buyerNick: row.buyerNick,
    appCid: row.appCid,
    receiverAppUids,
    replyId: row.replyId,
    text: row.text,
    imageUrl: row.imageUrl,
    imageLocalPath: row.imageLocalPath,
    status: row.status,
    statusLabel,
    plainError,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    ackMsgId: row.ackMsgId,
    qianfanMsgId: row.qianfanMsgId,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    nextRetryAt: row.nextRetryAt?.toISOString() || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sentAt: row.sentAt?.toISOString() || null,
    finishedAt: row.finishedAt?.toISOString() || null,
    targetLock,
    payloadSummary,
    statusFlow: flow,
    isSent: row.status === 'sent',
  }
}

function buildStatusFlow(status: string) {
  const steps = ['创建', '锁定买家', '发送中', '等待确认', '已发送']
  const map: Record<string, number> = {
    pending: 0,
    claimed: 1,
    target_checking: 1,
    target_blocked: 1,
    sending: 2,
    ack_waiting: 3,
    verifying: 3,
    retrying: 2,
    sent: 4,
    failed: 2,
    dead_letter: 2,
    cancelled: 0,
  }
  const active = map[status] ?? 0
  return steps.map((label, idx) => ({
    label,
    done: idx < active || (status === 'sent' && idx <= 4),
    active: idx === active && status !== 'sent' && status !== 'cancelled',
    failed: status === 'target_blocked' && idx === 1,
  }))
}

export function presentQianfanSendAttempt(row: {
  id: string
  jobId: string
  attemptNo: number
  status: string
  startedAt: Date
  finishedAt: Date | null
  errorCode: string | null
  errorMessage: string | null
}) {
  return {
    id: row.id,
    jobId: row.jobId,
    attemptNo: row.attemptNo,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    plainError: row.errorCode ? ERROR_PLAIN[row.errorCode] || row.errorMessage : row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() || null,
  }
}
