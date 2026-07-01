import { prisma } from '../../lib/prisma'
import type { AgentTaskResultBody, AgentTaskView } from './agent.types'
import {
  AGENT_TASK_STATUS_LABELS,
  AGENT_TASK_TYPE_LABELS,
  AGENT_TASK_TYPES,
  type AgentTaskType,
} from './agent.types'

function parseJson(raw: string | null | undefined, fallback: Record<string, unknown> = {}) {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : fallback
  } catch {
    return fallback
  }
}

export function toTaskView(row: {
  id: string
  machineId: string | null
  type: string
  payloadJson: string
  status: string
  resultJson: string | null
  errorMessage: string | null
  retryCount: number
  maxRetries: number
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}): AgentTaskView {
  return {
    id: row.id,
    machineId: row.machineId,
    type: row.type,
    typeLabel: AGENT_TASK_TYPE_LABELS[row.type] || row.type,
    payload: parseJson(row.payloadJson),
    status: row.status,
    statusLabel: AGENT_TASK_STATUS_LABELS[row.status] || row.status,
    result: row.resultJson ? parseJson(row.resultJson) : null,
    errorMessage: row.errorMessage,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() || null,
    finishedAt: row.finishedAt?.toISOString() || null,
  }
}

export function isValidTaskType(type: string): type is AgentTaskType {
  return (AGENT_TASK_TYPES as readonly string[]).includes(type)
}

export async function createAgentTask(input: {
  type: string
  payload?: Record<string, unknown>
  machineId?: string | null
  maxRetries?: number
}) {
  const type = String(input.type || '').trim()
  if (!isValidTaskType(type)) {
    throw new Error(`不支持的任务类型：${type}`)
  }

  const task = await prisma.agentTask.create({
    data: {
      type,
      machineId: input.machineId || null,
      payloadJson: JSON.stringify(input.payload || {}),
      status: 'pending',
      maxRetries: input.maxRetries ?? 3,
    },
  })

  return toTaskView(task)
}

export async function pullAgentTask(machineId: string) {
  const task = await prisma.agentTask.findFirst({
    where: {
      status: 'pending',
      OR: [{ machineId: null }, { machineId }],
    },
    orderBy: { createdAt: 'asc' },
  })

  if (!task) return null

  const updated = await prisma.agentTask.update({
    where: { id: task.id },
    data: {
      status: 'running',
      machineId,
      startedAt: new Date(),
    },
  })

  return toTaskView(updated)
}

export async function submitAgentTaskResult(
  taskId: string,
  machineId: string,
  body: AgentTaskResultBody,
) {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId } })
  if (!task) throw new Error('任务不存在')
  if (task.machineId && task.machineId !== machineId) {
    throw new Error('任务不属于当前本地助手')
  }

  const status = body.status
  const retryable = status === 'retryable_failed'
  const failed = status === 'failed' || retryable
  const canRetry = retryable && task.retryCount < task.maxRetries

  const nextStatus = canRetry ? 'pending' : status
  const nextRetryCount = canRetry ? task.retryCount + 1 : task.retryCount

  const updated = await prisma.agentTask.update({
    where: { id: taskId },
    data: {
      status: nextStatus,
      resultJson: body.result ? JSON.stringify(body.result) : null,
      errorMessage: body.errorMessage || null,
      retryCount: nextRetryCount,
      finishedAt: failed && !canRetry ? new Date() : canRetry ? null : new Date(),
      startedAt: canRetry ? null : task.startedAt,
    },
  })

  return toTaskView(updated)
}

export async function listAgentTasks(limit = 50) {
  const rows = await prisma.agentTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(toTaskView)
}

export async function retryAgentTask(taskId: string) {
  const task = await prisma.agentTask.findUnique({ where: { id: taskId } })
  if (!task) throw new Error('任务不存在')
  if (!['failed', 'retryable_failed'].includes(task.status)) {
    throw new Error('只有失败任务可以重试')
  }

  const updated = await prisma.agentTask.update({
    where: { id: taskId },
    data: {
      status: 'pending',
      errorMessage: null,
      resultJson: null,
      startedAt: null,
      finishedAt: null,
    },
  })

  return toTaskView(updated)
}

export async function createQianfanControlTask(
  type: 'qianfan.start' | 'qianfan.stop' | 'qianfan.restart',
  machineId?: string | null,
) {
  return createAgentTask({ type, machineId, payload: {} })
}

export async function createQianfanSendTextTask(payload: {
  shopName?: string
  buyerNick: string
  appCid?: string
  text: string
  receiverAppUids?: string[]
}) {
  if (!payload.buyerNick?.trim()) throw new Error('必须指定买家昵称，不能猜最近会话')
  if (!payload.text?.trim()) throw new Error('发送内容不能为空')
  return createAgentTask({ type: 'qianfan.sendText', payload })
}

export async function createQianfanSendImageTask(payload: {
  shopName?: string
  buyerNick: string
  appCid?: string
  imagePath: string
  receiverAppUids?: string[]
}) {
  if (!payload.buyerNick?.trim()) throw new Error('必须指定买家昵称，不能猜最近会话')
  if (!payload.imagePath?.trim()) throw new Error('图片路径不能为空')
  return createAgentTask({ type: 'qianfan.sendImage', payload })
}
