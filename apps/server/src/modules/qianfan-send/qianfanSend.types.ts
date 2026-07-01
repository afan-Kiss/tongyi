export type QianfanSendSource = 'wechat_reply' | 'manual' | 'auto_reply' | 'test'
export type QianfanMessageType = 'text' | 'image'

export type QianfanSendJobStatus =
  | 'pending'
  | 'claimed'
  | 'target_checking'
  | 'target_blocked'
  | 'sending'
  | 'ack_waiting'
  | 'verifying'
  | 'sent'
  | 'retrying'
  | 'failed'
  | 'dead_letter'
  | 'cancelled'

export interface QianfanTargetLock {
  shopTitle: string
  buyerNick: string
  appCid: string
  receiverAppUids: string[]
  replyId?: number | null
  source: QianfanSendSource
  createdAt: string
}

export interface CreateQianfanTextJobInput {
  source?: QianfanSendSource
  shopTitle: string
  buyerNick: string
  appCid: string
  receiverAppUids: string[]
  replyId?: number | null
  text: string
}

export interface CreateQianfanImageJobInput {
  source?: QianfanSendSource
  shopTitle: string
  buyerNick: string
  appCid: string
  receiverAppUids: string[]
  replyId?: number | null
  imageUrl?: string
  imageLocalPath?: string
  mediaId?: string
}

export const NON_RETRYABLE_ERRORS = new Set([
  'target_mismatch',
  'missing_appCid',
  'missing_receiverAppUids',
  'buyer_mismatch',
  'shop_mismatch',
  'invalid_payload',
  'missing_buyerNick',
  'missing_shopTitle',
])

export const RETRYABLE_ERRORS = new Set([
  'qianfan_not_running',
  'cdp_not_ready',
  'ws_not_ready',
  'ack_timeout',
  'network_error',
  'local_api_timeout',
  'agent_offline',
])

export const RETRY_DELAYS_MS = [10_000, 30_000, 90_000]

export const STATUS_LABELS: Record<string, string> = {
  pending: '已创建',
  claimed: '本地助手已领取',
  target_checking: '锁定买家中',
  target_blocked: '目标不匹配，已拦截',
  sending: '发送中',
  ack_waiting: '等待千帆确认',
  verifying: '验证回执中',
  sent: '已发送',
  retrying: '稍后重试',
  failed: '发送失败',
  dead_letter: '多次失败，需人工处理',
  cancelled: '已取消',
}

export const ERROR_PLAIN: Record<string, string> = {
  qianfan_not_running: '没有找到千帆客服台，请先启动千帆机器人',
  target_mismatch: '买家目标不匹配，已拦截，避免发错人',
  ack_timeout: '千帆没有确认收到，稍后重试',
  ws_not_ready: '千帆 WebSocket 未就绪，稍后重试',
  cdp_not_ready: '千帆调试通道未就绪，稍后重试',
  network_error: '网络异常，稍后重试',
  local_api_timeout: '千帆本地 API 超时，稍后重试',
  agent_offline: '本地助手离线，无法发送',
  missing_appCid: '缺少 appCid，不能发送',
  missing_receiverAppUids: '缺少 receiverAppUids，不能发送',
  invalid_payload: '发送内容不完整',
}
