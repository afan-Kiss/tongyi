import {
  createQianfanControlTask,
  createQianfanSendImageTask,
  createQianfanSendTextTask,
} from '../agent/agent-task.service'
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
  shopName?: string
  buyerNick: string
  appCid?: string
  text: string
  receiverAppUids?: string[]
}) {
  const agent = await getAgentOverview()
  if (!agent.hasOnlineAgent) {
    return {
      queued: false,
      message: '本地助手离线，无法发送。千帆发送必须在本地助手执行。',
      task: null,
    }
  }
  const task = await createQianfanSendTextTask(payload)
  return { queued: true, message: '已创建发送文字任务', task }
}

export async function enqueueQianfanSendImage(payload: {
  shopName?: string
  buyerNick: string
  appCid?: string
  imagePath: string
  receiverAppUids?: string[]
}) {
  const agent = await getAgentOverview()
  if (!agent.hasOnlineAgent) {
    return {
      queued: false,
      message: '本地助手离线，无法发送图片。',
      task: null,
    }
  }
  const task = await createQianfanSendImageTask(payload)
  return { queued: true, message: '已创建发送图片任务', task }
}
