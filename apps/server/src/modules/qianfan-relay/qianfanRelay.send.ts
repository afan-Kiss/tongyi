import { createTextSendJob, createImageSendJob } from '../qianfan-send/qianfanSend.service'
import { createQianfanControlTask } from '../agent/agent-task.service'
import { getAgentOverview } from '../agent/agent.service'

export async function enqueueQianfanStart(machineId?: string | null) {
  const agent = await getAgentOverview()
  if (!agent.hasOnlineAgent) {
    return {
      queued: false,
      message: '本地助手离线，无法启动千帆。请在本机运行本地助手后再试。',
      task: null,
    }
  }
  const task = await createQianfanControlTask('qianfan.start', machineId || agent.machines.find((m) => m.online)?.id)
  return { queued: true, message: '已创建启动任务，等待本地助手执行', task }
}

export async function enqueueQianfanStop(machineId?: string | null) {
  const agent = await getAgentOverview()
  if (!agent.hasOnlineAgent) {
    return {
      queued: false,
      message: '本地助手离线，无法停止千帆。服务器不会直接操作本机进程。',
      task: null,
    }
  }
  const task = await createQianfanControlTask('qianfan.stop', machineId || agent.machines.find((m) => m.online)?.id)
  return { queued: true, message: '已创建停止任务', task }
}

export async function enqueueQianfanRestart(machineId?: string | null) {
  const agent = await getAgentOverview()
  if (!agent.hasOnlineAgent) {
    return {
      queued: false,
      message: '本地助手离线，无法重启千帆。',
      task: null,
    }
  }
  const task = await createQianfanControlTask(
    'qianfan.restart',
    machineId || agent.machines.find((m) => m.online)?.id,
  )
  return { queued: true, message: '已创建重启任务', task }
}

export async function enqueueQianfanSendText(payload: {
  shopTitle?: string
  shopName?: string
  buyerNick: string
  appCid?: string
  text: string
  receiverAppUids?: string[]
  replyId?: number
  source?: string
}) {
  try {
    const job = await createTextSendJob({
      source: (payload.source as 'manual') || 'manual',
      shopTitle: payload.shopTitle || payload.shopName || '',
      buyerNick: payload.buyerNick,
      appCid: payload.appCid || '',
      receiverAppUids: payload.receiverAppUids || [],
      replyId: payload.replyId,
      text: payload.text,
    })
    return { queued: true, message: '已创建文字发送任务', task: { id: job.taskId }, job }
  } catch (err) {
    return {
      queued: false,
      message: err instanceof Error ? err.message : '创建发送任务失败',
      task: null,
      job: null,
    }
  }
}

export async function enqueueQianfanSendImage(payload: {
  shopTitle?: string
  shopName?: string
  buyerNick: string
  appCid?: string
  imagePath?: string
  imageLocalPath?: string
  imageUrl?: string
  receiverAppUids?: string[]
  replyId?: number
}) {
  try {
    const job = await createImageSendJob({
      source: 'manual',
      shopTitle: payload.shopTitle || payload.shopName || '',
      buyerNick: payload.buyerNick,
      appCid: payload.appCid || '',
      receiverAppUids: payload.receiverAppUids || [],
      replyId: payload.replyId,
      imageLocalPath: payload.imageLocalPath || payload.imagePath,
      imageUrl: payload.imageUrl,
    })
    return { queued: true, message: '已创建图片发送任务', task: { id: job.taskId }, job }
  } catch (err) {
    return {
      queued: false,
      message: err instanceof Error ? err.message : '创建发送任务失败',
      task: null,
      job: null,
    }
  }
}
