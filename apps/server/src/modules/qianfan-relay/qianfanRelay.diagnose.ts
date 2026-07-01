import fs from 'node:fs'
import path from 'node:path'
import { getAgentOverview } from '../agent/agent.service'
import { readQianfanRelayFileSnapshot } from './qianfanRelay.status'

export interface QianfanDiagnoseItem {
  level: 'ok' | 'warn' | 'error' | 'info'
  title: string
  message: string
  suggestion?: string
}

export async function diagnoseQianfanRelay(): Promise<{
  ok: boolean
  summary: string
  items: QianfanDiagnoseItem[]
}> {
  const snapshot = await readQianfanRelayFileSnapshot()
  const agent = await getAgentOverview()
  const items: QianfanDiagnoseItem[] = []

  items.push({
    level: snapshot.rootExists ? 'ok' : 'error',
    title: '千帆机器人目录',
    message: snapshot.rootExists ? `已找到：${snapshot.rootPath}` : '目录不存在，无法读取本地状态',
    suggestion: snapshot.rootExists ? undefined : '在本机配置 QIANFAN_RELAY_ROOT 环境变量',
  })

  items.push({
    level: agent.hasOnlineAgent ? 'ok' : 'warn',
    title: '本地助手',
    message: agent.summary,
    suggestion: agent.hasOnlineAgent ? undefined : '请在本机启动本地助手 EXE 后再操作千帆启停',
  })

  items.push({
    level: snapshot.running ? 'ok' : 'error',
    title: '千帆中转进程',
    message: snapshot.running ? '检测到千帆相关端口或日志活动' : '千帆中转没有启动',
    suggestion: snapshot.running ? undefined : '点击「启动」或在本机千帆机器人托盘启动中转',
  })

  items.push({
    level: snapshot.devtoolsReachable ? 'ok' : 'error',
    title: '千帆客服台 DevTools',
    message: snapshot.devtoolsReachable
      ? `127.0.0.1:${snapshot.devtoolsPort} 可访问`
      : `DevTools ${snapshot.devtoolsPort} 不可访问`,
    suggestion: snapshot.devtoolsReachable
      ? undefined
      : '用「启动千帆调试模式.bat」打开千帆客服台',
  })

  items.push({
    level:
      snapshot.attachedShopCount >= snapshot.expectedShopCount
        ? 'ok'
        : snapshot.attachedShopCount > 0
          ? 'warn'
          : 'error',
    title: '四店监听',
    message: `${snapshot.attachedShopCount}/${snapshot.expectedShopCount} 店已识别`,
    suggestion:
      snapshot.attachedShopCount >= snapshot.expectedShopCount
        ? undefined
        : '确认千帆客服台四个店铺页面都已打开',
  })

  items.push({
    level: snapshot.localApiReachable ? 'ok' : 'warn',
    title: '微信通知通道',
    message: snapshot.localApiReachable
      ? `本地 API ${snapshot.localApiPort} 在线`
      : '微信机器人本地 API 未检测到',
    suggestion: snapshot.localApiReachable ? undefined : '确认千帆机器人内微信 Worker 已启动',
  })

  if (snapshot.pendingCount > 0) {
    items.push({
      level: snapshot.pendingCount > 15 ? 'warn' : 'info',
      title: '待回复队列',
      message: `当前 pending ${snapshot.pendingCount} 条`,
      suggestion: snapshot.pendingCount > 15 ? '可尝试重启千帆中转或检查去重文件' : undefined,
    })
  }

  if (snapshot.lastBuyerMessageAt) {
    items.push({
      level: 'info',
      title: '最近买家消息',
      message: snapshot.lastBuyerMessageAt,
    })
  }

  if (snapshot.lastWechatNotifyAt) {
    items.push({
      level: 'info',
      title: '最近微信通知',
      message: snapshot.lastWechatNotifyAt,
    })
  }

  const errorItems = items.filter((i) => i.level === 'error')
  const ok = errorItems.length === 0 && snapshot.listenerReady

  return {
    ok,
    summary: snapshot.plainSummary,
    items,
  }
}

export async function readQianfanMessages(limit = 30) {
  const dataDir = (await readQianfanRelayFileSnapshot()).dataDir
  const pending = readJsonArray(path.join(dataDir, 'pending-notifications.json'))
  const sentMap = readJsonObject(path.join(dataDir, 'sent-notification-map.json'))

  const pendingRows = pending.slice(-limit).reverse().map((row, idx) => normalizeMessageRow(row, 'pending', idx))
  const notifiedRows = Object.values(sentMap)
    .slice(-limit)
    .reverse()
    .map((row, idx) => normalizeMessageRow(row, 'notified', idx))

  return {
    pending: pendingRows,
    recent: [...pendingRows, ...notifiedRows].slice(0, limit),
  }
}

export async function readQianfanNotifications(limit = 30) {
  const logsDir = (await readQianfanRelayFileSnapshot()).logsDir
  const debugDir = path.join(logsDir, 'debug')
  if (!fs.existsSync(debugDir)) return { items: [] }

  const files = fs
    .readdirSync(debugDir)
    .filter((f) => f.includes('wxbot-callback') || f.includes('qianfan-to-wechat'))
    .sort()
    .reverse()

  const items: Record<string, unknown>[] = []
  for (const file of files) {
    if (items.length >= limit) break
    const lines = fs.readFileSync(path.join(debugDir, file), 'utf8').trim().split(/\r?\n/).filter(Boolean)
    for (const line of lines.reverse()) {
      if (items.length >= limit) break
      try {
        items.push(JSON.parse(line))
      } catch {
        // skip
      }
    }
  }

  return { items }
}

export async function readQianfanLogs(limit = 50) {
  const logsDir = (await readQianfanRelayFileSnapshot()).logsDir
  if (!fs.existsSync(logsDir)) return { lines: [] }

  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(logsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)

  const lines: string[] = []
  for (const { f } of files) {
    const content = fs.readFileSync(path.join(logsDir, f), 'utf8')
    const part = content.trim().split(/\r?\n/).filter(Boolean)
    lines.push(...part.slice(-limit))
    if (lines.length >= limit) break
  }

  return { lines: lines.slice(-limit) }
}

function readJsonArray(filePath: string): unknown[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (Array.isArray(raw)) return raw
    if (raw && Array.isArray(raw.items)) return raw.items
    return []
  } catch {
    return []
  }
}

function readJsonObject(filePath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(filePath)) return {}
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function normalizeMessageRow(row: unknown, source: string, idx: number) {
  const r = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
  return {
    id: String(r.id || r.replyId || `${source}-${idx}`),
    replyId: r.replyId ?? null,
    shopName: r.shopTitle || r.shopName || null,
    buyerNick: r.buyerNick || r.senderNick || null,
    appCid: r.appCid || null,
    text: r.text || r.content || null,
    source,
    notifyStatus: r.notifyStatus || r.status || null,
    replyStatus: r.replyStatus || null,
    createdAt: r.createdAt || r.createAt || null,
  }
}
