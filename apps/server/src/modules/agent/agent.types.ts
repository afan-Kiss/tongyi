export const AGENT_TASK_TYPES = [
  'excel.read',
  'excel.write',
  'excel.export',
  'print.label',
  'print.photo',
  'qianfan.start',
  'qianfan.stop',
  'qianfan.restart',
  'qianfan.status',
  'qianfan.sendText',
  'qianfan.sendImage',
  'file.upload',
  'folder.watchUpload',
] as const

export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number]

export type AgentTaskStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'retryable_failed'

export interface AgentRegisterBody {
  name?: string
  machineCode: string
  version?: string
  capabilities?: string[]
  ip?: string
}

export interface AgentHeartbeatBody {
  machineCode: string
  status?: string
  version?: string
  capabilities?: string[]
  detail?: Record<string, unknown>
}

export interface AgentTaskPayload {
  [key: string]: unknown
}

export interface AgentTaskResultBody {
  status: 'success' | 'failed' | 'retryable_failed'
  result?: Record<string, unknown>
  errorMessage?: string
}

export interface AgentMachineView {
  id: string
  name: string
  machineCode: string
  status: string
  statusLabel: string
  lastSeenAt: string | null
  version: string | null
  ip: string | null
  capabilities: string[]
  online: boolean
}

export interface AgentTaskView {
  id: string
  machineId: string | null
  type: string
  typeLabel: string
  payload: Record<string, unknown>
  status: string
  statusLabel: string
  result: Record<string, unknown> | null
  errorMessage: string | null
  retryCount: number
  maxRetries: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export const AGENT_TASK_STATUS_LABELS: Record<string, string> = {
  pending: '等待执行',
  running: '执行中',
  success: '成功',
  failed: '失败',
  retryable_failed: '失败（可重试）',
}

export const AGENT_TASK_TYPE_LABELS: Record<string, string> = {
  'excel.read': '读取 Excel',
  'excel.write': '写入 Excel',
  'excel.export': '导出 Excel',
  'print.label': '打印标签',
  'print.photo': '打印照片',
  'qianfan.start': '启动千帆中转',
  'qianfan.stop': '停止千帆中转',
  'qianfan.restart': '重启千帆中转',
  'qianfan.status': '读取千帆状态',
  'qianfan.sendText': '千帆发送文字',
  'qianfan.sendImage': '千帆发送图片',
  'file.upload': '上传文件',
  'folder.watchUpload': '文件夹自动上传',
}

export const AGENT_MACHINE_STATUS_LABELS: Record<string, string> = {
  online: '在线',
  offline: '离线',
  busy: '忙碌',
  error: '异常',
}
