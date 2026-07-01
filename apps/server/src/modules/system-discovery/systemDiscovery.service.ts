import fs from 'node:fs'
import path from 'node:path'
import {
  MONOREPO_ROOT,
  getJizhangWebUrl,
  getQianfanRelayRoot,
  getZhuboAnalysisWebUrl,
} from '../../config/env'
import { getAgentOverview } from '../agent/agent.service'
import { getSettings, saveSettings } from '../../services/settings.service'

export interface DiscoveredSystem {
  key: string
  name: string
  path: string
  confidence: number
  status: 'found' | 'missing' | 'skipped'
  reason: string
  suggestedEnv?: Record<string, string>
}

export interface PlatformPathsSettings {
  qianfanRelayRoot?: string
  jizhangWebUrl?: string
  zhuboAnalysisWebUrl?: string
  outboundConfigPath?: string
}

export type RuntimeMode = 'local' | 'server' | 'mixed'

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export function getParentSourceDir(): string {
  return path.resolve(MONOREPO_ROOT, '..')
}

export function isSiblingScanAvailable(): boolean {
  try {
    const parent = getParentSourceDir()
    if (!fs.existsSync(parent)) return false
    const stat = fs.statSync(parent)
    return stat.isDirectory()
  } catch {
    return false
  }
}

function scoreQianfan(dirPath: string, folderName: string): DiscoveredSystem | null {
  let score = 0
  const reasons: string[] = []
  const cfg = path.join(dirPath, 'config.wxbot-new.json')
  const worker = path.join(dirPath, 'src', 'runtime', 'worker-registry.js')
  const pkg = readJsonSafe(path.join(dirPath, 'package.json'))

  if (fs.existsSync(cfg)) {
    score += 45
    reasons.push('发现 config.wxbot-new.json')
  }
  if (fs.existsSync(worker)) {
    score += 40
    reasons.push('发现 worker-registry.js')
  }
  if (/千帆|qianfan/i.test(folderName)) score += 10
  if (pkg?.name && /qianfan|customer-service|four-in-one/i.test(String(pkg.name))) {
    score += 8
    reasons.push(`package name=${pkg.name}`)
  }
  if (score < 40) return null
  return {
    key: 'qianfan',
    name: '千帆中转机器人',
    path: dirPath,
    confidence: Math.min(score, 99),
    status: 'found',
    reason: reasons.join('；') || '匹配千帆特征',
    suggestedEnv: { QIANFAN_RELAY_ROOT: dirPath },
  }
}

function scoreJizhang(dirPath: string, folderName: string): DiscoveredSystem | null {
  let score = 0
  const reasons: string[] = []
  const pkg = readJsonSafe(path.join(dirPath, 'package.json'))
  const hasServer = fs.existsSync(path.join(dirPath, 'apps', 'server'))
  const hasWeb = fs.existsSync(path.join(dirPath, 'apps', 'web'))

  if (/记账|jizhang/i.test(folderName)) score += 25
  if (pkg?.name && /jizhang|ledger|account/i.test(String(pkg.name))) {
    score += 20
    reasons.push(`package name=${pkg.name}`)
  }
  if (hasServer && hasWeb) {
    score += 35
    reasons.push('发现 apps/server + apps/web')
  }
  if (fs.existsSync(path.join(dirPath, 'apps', 'server', 'prisma'))) {
    score += 10
    reasons.push('发现 Prisma')
  }
  if (score < 45) return null

  const webPortGuess = 'http://127.0.0.1:5173'
  return {
    key: 'jizhang',
    name: '经营记账系统',
    path: dirPath,
    confidence: Math.min(score, 98),
    status: 'found',
    reason: reasons.join('；') || '匹配记账 monorepo 特征',
    suggestedEnv: { JIZHANG_WEB_URL: webPortGuess },
  }
}

function scoreZhubo(dirPath: string, folderName: string): DiscoveredSystem | null {
  let score = 0
  const reasons: string[] = []
  const pkg = readJsonSafe(path.join(dirPath, 'package.json'))
  const hasServer = fs.existsSync(path.join(dirPath, 'apps', 'server'))

  if (/主播|zhubo|live/i.test(folderName)) score += 25
  if (pkg?.name && /live|zhubo|anchor/i.test(String(pkg.name))) {
    score += 20
    reasons.push(`package name=${pkg.name}`)
  }
  if (hasServer) {
    score += 30
    reasons.push('发现 apps/server')
  }
  if (score < 40) return null

  return {
    key: 'zhubo',
    name: '主播分析系统',
    path: dirPath,
    confidence: Math.min(score, 96),
    status: 'found',
    reason: reasons.join('；') || '匹配主播分析特征',
    suggestedEnv: { ZHUBO_ANALYSIS_WEB_URL: 'http://127.0.0.1:5174' },
  }
}

function scoreOutbound(dirPath: string, folderName: string): DiscoveredSystem | null {
  if (!/辅助出库|outbound/i.test(folderName)) return null
  const cfg = path.join(dirPath, 'config.json')
  if (!fs.existsSync(cfg)) return null
  return {
    key: 'outbound',
    name: '辅助出库软件',
    path: dirPath,
    confidence: 88,
    status: 'found',
    reason: '发现 config.json',
    suggestedEnv: { OUTBOUND_CONFIG_PATH: cfg },
  }
}

function scanDirectory(dirPath: string, folderName: string): DiscoveredSystem[] {
  const pkgPath = path.join(dirPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return []

  const hits: DiscoveredSystem[] = []
  const q = scoreQianfan(dirPath, folderName)
  const j = scoreJizhang(dirPath, folderName)
  const z = scoreZhubo(dirPath, folderName)
  const o = scoreOutbound(dirPath, folderName)
  if (q) hits.push(q)
  if (j) hits.push(j)
  if (z) hits.push(z)
  if (o) hits.push(o)

  if (!hits.length) {
    const pkg = readJsonSafe(pkgPath)
    hits.push({
      key: `project:${folderName}`,
      name: String(pkg?.name || folderName),
      path: dirPath,
      confidence: 30,
      status: 'found',
      reason: '发现 package.json 项目',
    })
  }
  return hits
}

export async function scanSiblingSystems() {
  const baseDir = getParentSourceDir()
  const available = isSiblingScanAvailable()

  if (!available) {
    return {
      available: false,
      baseDir,
      message:
        process.platform === 'win32'
          ? '当前找不到同目录父文件夹，可能是在云服务器运行。请启动本地助手，由助手上报路径。'
          : '当前环境不支持 Windows 本地同目录扫描。云服务器请使用本地助手上报。',
      systems: [] as DiscoveredSystem[],
      runtimeMode: await detectRuntimeMode(),
    }
  }

  let entries: string[] = []
  try {
    entries = fs.readdirSync(baseDir)
  } catch (err) {
    return {
      available: false,
      baseDir,
      message: err instanceof Error ? err.message : '读取父目录失败',
      systems: [] as DiscoveredSystem[],
      runtimeMode: await detectRuntimeMode(),
    }
  }

  const systems: DiscoveredSystem[] = []
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = path.join(baseDir, name)
    try {
      if (!fs.statSync(full).isDirectory()) continue
      if (path.resolve(full) === path.resolve(MONOREPO_ROOT)) continue
      systems.push(...scanDirectory(full, name))
    } catch {
      // skip unreadable dir
    }
  }

  systems.sort((a, b) => b.confidence - a.confidence)

  return {
    available: true,
    baseDir,
    message: systems.length ? `在 ${baseDir} 找到 ${systems.length} 个候选系统` : '同目录下暂未识别到已知系统',
    systems,
    runtimeMode: await detectRuntimeMode(),
  }
}

export async function detectRuntimeMode(): Promise<{
  mode: RuntimeMode
  label: string
  description: string
}> {
  const agent = await getAgentOverview()
  const siblingAvailable = isSiblingScanAvailable()
  const deploymentMode = process.env.DEPLOYMENT_MODE?.trim().toLowerCase()

  if (deploymentMode === 'server') {
    return agent.hasOnlineAgent
      ? {
          mode: 'mixed',
          label: '混合模式',
          description: '服务器正常运行，本地助手在线，可执行 Excel/千帆/打印等本地任务。',
        }
      : {
          mode: 'server',
          label: '服务器模式',
          description: '云服务器不能访问本机目录。请启动本地助手，本地 Excel/千帆/打印由助手执行。',
        }
  }

  if (siblingAvailable && process.platform === 'win32') {
    return agent.hasOnlineAgent
      ? {
          mode: 'mixed',
          label: '混合模式',
          description: '本机可直接发现同目录系统，本地助手也在线，任务执行更稳定。',
        }
      : {
          mode: 'local',
          label: '本地模式',
          description: '可以直接扫描同目录系统并读取本地千帆数据。',
        }
  }

  if (agent.hasOnlineAgent) {
    return {
      mode: 'mixed',
      label: '混合模式',
      description: '服务器正常，本地助手在线，可执行本地任务。',
    }
  }

  return {
    mode: 'server',
    label: '服务器模式',
    description: '当前无法扫描本地同目录。请启动本地助手后再操作千帆/Excel/打印。',
  }
}

let platformPathsCache: PlatformPathsSettings = {}

export function setPlatformPathsCache(paths: PlatformPathsSettings): void {
  platformPathsCache = { ...paths }
}

export function getCachedPlatformPaths(): PlatformPathsSettings {
  return platformPathsCache
}

export async function loadPlatformPathsCache(): Promise<void> {
  const paths = await getEffectivePlatformPaths()
  setPlatformPathsCache(paths)
}

export function getEffectiveQianfanRelayRootSync(): string {
  const fromCache = platformPathsCache.qianfanRelayRoot?.trim()
  if (fromCache) return path.resolve(fromCache)
  return getQianfanRelayRoot()
}

export function getEffectiveJizhangWebUrlSync(): string {
  return platformPathsCache.jizhangWebUrl?.trim() || getJizhangWebUrl()
}

export function getEffectiveZhuboAnalysisWebUrlSync(): string {
  return platformPathsCache.zhuboAnalysisWebUrl?.trim() || getZhuboAnalysisWebUrl()
}

export async function getEffectivePlatformPaths(): Promise<PlatformPathsSettings> {
  const settings = await getSettings()
  const extra = settings as AppSettingsDataWithPlatform
  return extra.platformPaths || {}
}

interface AppSettingsDataWithPlatform {
  platformPaths?: PlatformPathsSettings
}

export async function applyDiscoveredPaths(input: {
  confirm?: boolean
  overwrite?: boolean
  paths?: PlatformPathsSettings
}) {
  if (!input.confirm) {
    throw new Error('请先确认后再应用路径，避免覆盖现有配置')
  }

  const current = await getSettings()
  const extra = current as AppSettingsDataWithPlatform
  const existing = extra.platformPaths || {}
  const incoming = input.paths || {}
  const next: PlatformPathsSettings = { ...existing }

  const mergeField = (key: keyof PlatformPathsSettings, envCurrent: string) => {
    const value = incoming[key]?.trim()
    if (!value) return
    const hasExisting = Boolean(existing[key]?.trim() || envCurrent)
    if (hasExisting && !input.overwrite) return
    next[key] = value
  }

  mergeField('qianfanRelayRoot', getQianfanRelayRoot())
  mergeField('jizhangWebUrl', getJizhangWebUrl())
  mergeField('zhuboAnalysisWebUrl', getZhuboAnalysisWebUrl())

  const saved = await saveSettings({ platformPaths: next } as Partial<typeof current>)
  setPlatformPathsCache(next)

  return {
    applied: next,
    skippedBecauseExisting: Object.keys(incoming).filter((k) => {
      const key = k as keyof PlatformPathsSettings
      return Boolean(existing[key]?.trim()) && !input.overwrite && incoming[key]
    }),
    settings: saved,
    hint: '已写入系统设置。若 .env 里已有同名字段，设置值会在运行时优先生效（重启后生效）。',
  }
}

export async function resolveQianfanRelayRootEffective(): Promise<string> {
  const fromSettings = (await getEffectivePlatformPaths()).qianfanRelayRoot?.trim()
  if (fromSettings) return path.resolve(fromSettings)
  return getQianfanRelayRoot()
}

export async function resolveJizhangWebUrlEffective(): Promise<string> {
  const fromSettings = (await getEffectivePlatformPaths()).jizhangWebUrl?.trim()
  if (fromSettings) return fromSettings
  return getJizhangWebUrl()
}

export async function resolveZhuboAnalysisWebUrlEffective(): Promise<string> {
  const fromSettings = (await getEffectivePlatformPaths()).zhuboAnalysisWebUrl?.trim()
  if (fromSettings) return fromSettings
  return getZhuboAnalysisWebUrl()
}
