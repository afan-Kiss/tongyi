import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import {
  getQianfanDevtoolsPort,
  getQianfanLocalApiPort,
  getQianfanLocalApiUrl,
} from '../../config/env'
import { getEffectiveQianfanRelayRootSync } from '../system-discovery/systemDiscovery.service'

function getQianfanRelayDataDirForRoot(root: string): string {
  const candidates = [
    path.join(root, 'dist', 'win-unpacked', 'data'),
    path.join(root, 'data'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

function getQianfanRelayLogsDirForRoot(root: string): string {
  const candidates = [
    path.join(root, 'dist', 'win-unpacked', 'logs'),
    path.join(root, 'logs'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

function checkPort(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs })
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function readLatestRuntimeLogLine(logsDir: string): string {
  try {
    const files = fs
      .readdirSync(logsDir)
      .filter((f) => f.startsWith('runtime-') && f.endsWith('.log'))
      .map((f) => ({ f, mtime: fs.statSync(path.join(logsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    if (!files.length) return ''
    const content = fs.readFileSync(path.join(logsDir, files[0].f), 'utf8')
    const lines = content.trim().split(/\r?\n/).filter(Boolean)
    return lines[lines.length - 1] || ''
  } catch {
    return ''
  }
}

function readTailJsonl(filePath: string, limit = 20): Record<string, unknown>[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean)
    const tail = lines.slice(-limit)
    const items: Record<string, unknown>[] = []
    for (const line of tail) {
      try {
        items.push(JSON.parse(line) as Record<string, unknown>)
      } catch {
        // skip bad line
      }
    }
    return items
  } catch {
    return []
  }
}

function findDebugJsonl(logsDir: string, prefix: string): string {
  const debugDir = path.join(logsDir, 'debug')
  if (!fs.existsSync(debugDir)) return ''
  const today = new Date()
  const dateStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  const exact = path.join(debugDir, `${prefix}-${dateStr}.jsonl`)
  if (fs.existsSync(exact)) return exact
  const files = fs
    .readdirSync(debugDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl'))
    .sort()
  return files.length ? path.join(debugDir, files[files.length - 1]) : ''
}

function parseTimestamp(value: unknown): Date | null {
  if (!value) return null
  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

function readConfigExpectedShopCount(): number {
  const cfgPath = path.join(getEffectiveQianfanRelayRootSync(), 'config.wxbot-new.json')
  const cfg = readJsonFile<{ qianfanDebug?: { expectedShopCount?: number } }>(cfgPath, {})
  const n = Number(cfg.qianfanDebug?.expectedShopCount || 4)
  return Number.isFinite(n) && n > 0 ? n : 4
}

export interface QianfanFileSnapshot {
  rootPath: string
  rootExists: boolean
  dataDir: string
  dataDirExists: boolean
  logsDir: string
  devtoolsPort: number
  devtoolsReachable: boolean
  localApiPort: number
  localApiReachable: boolean
  expectedShopCount: number
  attachedShopCount: number
  running: boolean
  qianfanReady: boolean
  listenerReady: boolean
  wechatReady: boolean
  lastBuyerMessageAt: string | null
  lastWechatNotifyAt: string | null
  lastWsFrameAt: string | null
  lastError: string | null
  lastRuntimeLog: string
  shops: { name: string; appCid?: string; ready?: boolean }[]
  pendingCount: number
  notifiedCount: number
  plainSummary: string
  detail: Record<string, unknown>
}

export async function readQianfanRelayFileSnapshot(): Promise<QianfanFileSnapshot> {
  const rootPath = getEffectiveQianfanRelayRootSync()
  const rootExists = (() => { try { return fs.existsSync(rootPath) } catch { return false } })()
  const dataDir = getQianfanRelayDataDirForRoot(rootPath)
  const dataDirExists = fs.existsSync(dataDir)
  const logsDir = getQianfanRelayLogsDirForRoot(rootPath)
  const devtoolsPort = getQianfanDevtoolsPort()
  const localApiPort = getQianfanLocalApiPort()

  const [devtoolsReachable, localApiReachable] = await Promise.all([
    checkPort('127.0.0.1', devtoolsPort),
    checkPort('127.0.0.1', localApiPort),
  ])

  const pending = readJsonFile<{ items?: unknown[] } | unknown[]>(
    path.join(dataDir, 'pending-notifications.json'),
    [],
  )
  const pendingItems = Array.isArray(pending) ? pending : pending.items || []
  const sentMap = readJsonFile<Record<string, unknown>>(
    path.join(dataDir, 'sent-notification-map.json'),
    {},
  )
  const sessionContext = readJsonFile<{ shops?: Record<string, unknown> }>(
    path.join(dataDir, 'qianfan-session-context.json'),
    {},
  )
  const appCidReceivers = readJsonFile<Record<string, unknown>>(
    path.join(dataDir, 'app-cid-receivers.json'),
    {},
  )

  const shops: { name: string; appCid?: string; ready?: boolean }[] = []
  const shopEntries = sessionContext.shops || appCidReceivers
  if (shopEntries && typeof shopEntries === 'object') {
    for (const [key, value] of Object.entries(shopEntries)) {
      const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
      shops.push({
        name: String(row.shopTitle || row.shopName || key),
        appCid: String(row.appCid || key),
        ready: Boolean(row.ready ?? row.attached ?? Object.keys(row).length > 0),
      })
    }
  }

  const expectedShopCount = readConfigExpectedShopCount()
  const attachedShopCount = shops.filter((s) => s.ready).length

  const buyerJsonl = findDebugJsonl(logsDir, 'qianfan-to-wechat')
  const wxJsonl = findDebugJsonl(logsDir, 'wxbot-callback')
  const buyerEvents = readTailJsonl(buyerJsonl, 30)
  const wxEvents = readTailJsonl(wxJsonl, 30)

  const lastBuyer = buyerEvents[buyerEvents.length - 1]
  const lastWx = wxEvents[wxEvents.length - 1]
  const lastBuyerMessageAt = parseTimestamp(
    lastBuyer?.createAt || lastBuyer?.createdAt || lastBuyer?.time,
  )
  const lastWechatNotifyAt = parseTimestamp(lastWx?.time || lastWx?.createdAt || lastWx?.at)

  const runtimeLine = readLatestRuntimeLogLine(logsDir)
  const lastWsFrameAt = parseTimestamp(
    buyerEvents.slice().reverse().find((e) => e.topic || e.event)?.time,
  )

  const qianfanReady = devtoolsReachable
  const listenerReady = devtoolsReachable && attachedShopCount > 0
  const wechatReady = localApiReachable
  const running = localApiReachable || devtoolsReachable || Boolean(runtimeLine)

  let lastError: string | null = null
  if (!rootExists) lastError = '千帆机器人目录不存在，请检查 QIANFAN_RELAY_ROOT 配置'
  else if (!running) lastError = '千帆中转没有启动'
  else if (!qianfanReady) lastError = '千帆客服台 DevTools 不可访问，请确认千帆客服台已用调试模式启动'
  else if (attachedShopCount < expectedShopCount) lastError = `店铺页面没识别全，当前 ${attachedShopCount}/${expectedShopCount} 店`
  else if (pendingItems.length > 20) lastError = '待回复/去重队列较多，可能卡住'

  const plainSummary = buildPlainSummary({
    rootExists,
    running,
    qianfanReady,
    listenerReady,
    wechatReady,
    attachedShopCount,
    expectedShopCount,
    pendingCount: pendingItems.length,
    lastError,
  })

  return {
    rootPath,
    rootExists,
    dataDir,
    dataDirExists,
    logsDir,
    devtoolsPort,
    devtoolsReachable,
    localApiPort,
    localApiReachable,
    expectedShopCount,
    attachedShopCount,
    running,
    qianfanReady,
    listenerReady,
    wechatReady,
    lastBuyerMessageAt: lastBuyerMessageAt?.toISOString() || null,
    lastWechatNotifyAt: lastWechatNotifyAt?.toISOString() || null,
    lastWsFrameAt: lastWsFrameAt?.toISOString() || null,
    lastError,
    lastRuntimeLog: runtimeLine,
    shops,
    pendingCount: pendingItems.length,
    notifiedCount: Object.keys(sentMap).length,
    plainSummary,
    detail: {
      localApiUrl: getQianfanLocalApiUrl(),
      pendingSample: pendingItems.slice(-5),
      buyerEventCount: buyerEvents.length,
      wxEventCount: wxEvents.length,
    },
  }
}

function buildPlainSummary(input: {
  rootExists: boolean
  running: boolean
  qianfanReady: boolean
  listenerReady: boolean
  wechatReady: boolean
  attachedShopCount: number
  expectedShopCount: number
  pendingCount: number
  lastError: string | null
}): string {
  if (!input.rootExists) return '千帆机器人路径未配置或不存在'
  if (!input.running) return '千帆中转没有启动'
  if (!input.qianfanReady) return '千帆客服台没有接入（DevTools 9322 不可访问）'
  if (input.attachedShopCount < input.expectedShopCount) {
    return `店铺页面没识别到（${input.attachedShopCount}/${input.expectedShopCount} 店）`
  }
  if (input.qianfanReady && !input.listenerReady) {
    return 'WS 有连接但还没解析出买家消息'
  }
  if (input.pendingCount > 0 && !input.wechatReady) {
    return '已收到买家消息但微信通知通道未就绪'
  }
  if (input.pendingCount > 15) return '去重/待回复状态可能卡住，建议一键诊断'
  if (input.listenerReady && input.wechatReady) return '系统正常，正在监听'
  return input.lastError || '状态读取中'
}

export async function upsertQianfanRelayStatusSnapshot() {
  const snapshot = await readQianfanRelayFileSnapshot()
  const { prisma } = await import('../../lib/prisma')
  await prisma.qianfanRelayStatus.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      running: snapshot.running,
      qianfanReady: snapshot.qianfanReady,
      listenerReady: snapshot.listenerReady,
      wechatReady: snapshot.wechatReady,
      attachedShopCount: snapshot.attachedShopCount,
      expectedShopCount: snapshot.expectedShopCount,
      lastBuyerMessageAt: snapshot.lastBuyerMessageAt ? new Date(snapshot.lastBuyerMessageAt) : null,
      lastWechatNotifyAt: snapshot.lastWechatNotifyAt ? new Date(snapshot.lastWechatNotifyAt) : null,
      lastWsFrameAt: snapshot.lastWsFrameAt ? new Date(snapshot.lastWsFrameAt) : null,
      lastError: snapshot.lastError,
      detailJson: JSON.stringify(snapshot.detail),
    },
    update: {
      running: snapshot.running,
      qianfanReady: snapshot.qianfanReady,
      listenerReady: snapshot.listenerReady,
      wechatReady: snapshot.wechatReady,
      attachedShopCount: snapshot.attachedShopCount,
      expectedShopCount: snapshot.expectedShopCount,
      lastBuyerMessageAt: snapshot.lastBuyerMessageAt ? new Date(snapshot.lastBuyerMessageAt) : null,
      lastWechatNotifyAt: snapshot.lastWechatNotifyAt ? new Date(snapshot.lastWechatNotifyAt) : null,
      lastWsFrameAt: snapshot.lastWsFrameAt ? new Date(snapshot.lastWsFrameAt) : null,
      lastError: snapshot.lastError,
      detailJson: JSON.stringify(snapshot.detail),
    },
  })
  return snapshot
}
