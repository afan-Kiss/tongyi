import path from 'node:path'

import fs from 'node:fs'

import dotenv from 'dotenv'



export const SERVER_ROOT = path.join(__dirname, '../..')

/** monorepo 根目录（apps/server 的上两级） */
export const MONOREPO_ROOT = path.resolve(SERVER_ROOT, '../..')



/** 统一端口规划（从 4725 起，避免 3xxx 端口冲突） */

export const DEFAULT_PORTS = {

  main: 4725,

  xiangyuWeb: 4726,

  xiangyuBridge: 4727,

  excelBridge: 4728,

  printAgent: 4729,

  /** 本地 Worker / 记账系统读取接口（仅 127.0.0.1） */
  scannerApi: 7789,

  /** 手机拍照专用 HTTPS（getUserMedia 需安全上下文） */
  mobileHttps: 4730,

  qianfanDevtools: 9322,

} as const



export function loadEnv(): void {

  const envPath = path.join(SERVER_ROOT, '.env')

  if (fs.existsSync(envPath)) {

    dotenv.config({ path: envPath })

  } else {

    dotenv.config()

  }

}



/** 解析环境变量布尔值；空值/undefined 使用 defaultValue；无法识别时 warning 后回退 defaultValue */
export function parseBool(
  value: string | undefined | null,
  defaultValue: boolean,
  label = 'BOOL',
): boolean {
  const v = value?.trim()
  if (!v) return defaultValue
  const lower = v.toLowerCase()
  if (lower === '0' || lower === 'false' || lower === 'off' || lower === 'no') return false
  if (lower === '1' || lower === 'true' || lower === 'on' || lower === 'yes') return true
  console.warn(`[env] ${label}="${v}" 无法识别，使用默认 ${defaultValue}`)
  return defaultValue
}



/** 解析端口；非法值回退 defaultPort 并打印 warning */
export function parsePort(value: string | undefined | null, defaultPort: number, label = 'PORT'): number {
  const v = value?.trim()
  if (!v) return defaultPort
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.warn(`[env] ${label}="${v}" 非法，使用默认 ${defaultPort}`)
    return defaultPort
  }
  return n
}



export function getPort(): number {

  return parsePort(process.env.PORT, DEFAULT_PORTS.main, 'PORT')

}



/** 手机拍照 HTTPS 端口；设为 0 可关闭 */
export function getMobileHttpsPort(): number {
  const v = process.env.MOBILE_HTTPS_PORT?.trim()
  if (v === '0') return 0
  if (v && !parseBool(v, true, 'MOBILE_HTTPS_PORT')) return 0
  return parsePort(process.env.MOBILE_HTTPS_PORT, DEFAULT_PORTS.mobileHttps, 'MOBILE_HTTPS_PORT')
}



export function getDataDir(): string {

  const dir = path.join(SERVER_ROOT, 'data')

  fs.mkdirSync(dir, { recursive: true })

  return dir

}



export function getMediaDir(): string {

  const dir = path.join(getDataDir(), 'media')

  fs.mkdirSync(dir, { recursive: true })

  return dir

}



export function getExcelBridgeUrl(): string {

  return process.env.EXCEL_BRIDGE_URL || `http://127.0.0.1:${DEFAULT_PORTS.excelBridge}`

}



export function getExcelBridgePort(): number {

  try {

    const u = new URL(getExcelBridgeUrl())

    return u.port ? parsePort(u.port, DEFAULT_PORTS.excelBridge, 'EXCEL_BRIDGE_URL port') : DEFAULT_PORTS.excelBridge

  } catch {

    return DEFAULT_PORTS.excelBridge

  }

}



export function getPrintAgentUrl(): string {

  return process.env.PRINT_AGENT_URL || `http://127.0.0.1:${DEFAULT_PORTS.printAgent}`

}

export function getScannerApiPort(): number {
  return parsePort(process.env.SCANNER_API_PORT, DEFAULT_PORTS.scannerApi, 'SCANNER_API_PORT')
}

/** 默认开启；设为 false 可关闭本地 Scanner API */
export function isScannerApiEnabled(): boolean {
  return parseBool(process.env.SCANNER_API_ENABLED, true, 'SCANNER_API_ENABLED')
}



export function getPrintAgentPort(): number {

  return parsePort(process.env.PRINT_AGENT_PORT, DEFAULT_PORTS.printAgent, 'PRINT_AGENT_PORT')

}



export function isExcelBridgeEnabled(): boolean {

  return parseBool(process.env.EXCEL_BRIDGE_ENABLED, true, 'EXCEL_BRIDGE_ENABLED')

}



/** 祥钰系统根目录（内置于 monorepo：apps/xiangyu） */
export function getXiangyuRoot(): string {
  const custom = process.env.XIANGYU_ROOT?.trim()
  if (custom) return path.resolve(custom)
  return path.join(MONOREPO_ROOT, 'apps/xiangyu')
}



export function getXiangyuPort(): number {

  return parsePort(process.env.XIANGYU_PORT, DEFAULT_PORTS.xiangyuWeb, 'XIANGYU_PORT')

}



export function getXiangyuBridgePort(): number {

  return parsePort(process.env.XIANGYU_BRIDGE_PORT, DEFAULT_PORTS.xiangyuBridge, 'XIANGYU_BRIDGE_PORT')

}



export interface XiangyuBridgeConfig {
  devtoolsPort: number
  qianfanDataDir: string
  bridgeUrl: string
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

/** 读取千帆中转机器人里的 DevTools 端口（与调试模式一致，默认 9322） */
function readQianfanBotDevtoolsPort(): number | null {
  const candidates = [
    path.join(MONOREPO_ROOT, '../千帆中转机器人/config.wxbot-new.json'),
    path.join(MONOREPO_ROOT, '../千帆中转机器人/config.wxbot-new.example.json'),
  ]
  for (const filePath of candidates) {
    const cfg = readJsonFile<{ qianfanDebug?: { devtoolsPort?: number } }>(filePath)
    const port = cfg?.qianfanDebug?.devtoolsPort
    if (port && port > 0) return port
  }
  return null
}

export function getXiangyuBridgeConfig(): XiangyuBridgeConfig {
  const bridgeUrl = `http://127.0.0.1:${getXiangyuBridgePort()}/send`
  const defaults: XiangyuBridgeConfig = {
    devtoolsPort: readQianfanBotDevtoolsPort() || DEFAULT_PORTS.qianfanDevtools,
    qianfanDataDir: path.resolve(MONOREPO_ROOT, '../千帆中转机器人/dist/win-unpacked/data'),
    bridgeUrl,
  }

  const xiangyuCfg = readJsonFile<{ bridge?: { devtoolsPort?: number; qianfanDataDir?: string; url?: string } }>(
    path.join(getXiangyuRoot(), 'config.json'),
  )
  const bridge = xiangyuCfg?.bridge
  return {
    devtoolsPort: bridge?.devtoolsPort && bridge.devtoolsPort !== 4730
      ? bridge.devtoolsPort
      : (readQianfanBotDevtoolsPort() || bridge?.devtoolsPort || defaults.devtoolsPort),
    qianfanDataDir: bridge?.qianfanDataDir?.trim() || defaults.qianfanDataDir,
    bridgeUrl: bridge?.url?.trim() || bridgeUrl,
  }
}

export function getQianfanDevtoolsPort(): number {
  if (process.env.QIANFAN_DEVTOOLS_PORT) {
    return parsePort(process.env.QIANFAN_DEVTOOLS_PORT, DEFAULT_PORTS.qianfanDevtools, 'QIANFAN_DEVTOOLS_PORT')
  }
  return getXiangyuBridgeConfig().devtoolsPort
}



export function getXiangyuWebUrl(): string {

  const custom = process.env.XIANGYU_WEB_URL?.trim()

  if (custom) return custom.replace(/\/$/, '')

  return `http://127.0.0.1:${getXiangyuPort()}`

}

/** 辅助出库软件 config.json（祥钰订单 Cookie 来源） */
export function getOutboundConfigPath(): string {
  const custom = process.env.OUTBOUND_CONFIG_PATH?.trim()
  if (custom) return path.resolve(custom)
  const candidates = [
    path.resolve(MONOREPO_ROOT, '../辅助出库软件/config.json'),
    path.resolve(MONOREPO_ROOT, '../辅助出库软件/dist/config.json'),
  ]
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath
  }
  return candidates[0]
}



export function isXiangyuEnabled(): boolean {

  return parseBool(process.env.XIANGYU_ENABLED, true, 'XIANGYU_ENABLED')

}



export const CERT_NO_REGEX =

  /^(?:DA|DB|DC|DD|DE|DF|DG|DH|DI|DK|DL|DM|DN|DP|DQ|DR|DW|ZQ|F|D)\d{3,8}$/i



export function getDefaultCertPrefix(): string {
  return (process.env.DEFAULT_CERT_PREFIX || 'F').trim().toUpperCase() || 'F'
}



export const DEFAULT_OUTBOUND_REMARK = '小红书发出'

/** 千帆中转机器人根目录 */
export function getQianfanRelayRoot(): string {
  const custom = process.env.QIANFAN_RELAY_ROOT?.trim()
  if (custom) return path.resolve(custom)
  return path.resolve(MONOREPO_ROOT, '../千帆中转机器人')
}

/** 千帆 data 目录（优先打包目录） */
export function getQianfanRelayDataDir(): string {
  const custom = process.env.QIANFAN_RELAY_DATA_DIR?.trim()
  if (custom) return path.resolve(custom)
  const root = getQianfanRelayRoot()
  const candidates = [
    path.join(root, 'dist', 'win-unpacked', 'data'),
    path.join(root, 'data'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

/** 千帆 logs 目录 */
export function getQianfanRelayLogsDir(): string {
  const custom = process.env.QIANFAN_RELAY_LOGS_DIR?.trim()
  if (custom) return path.resolve(custom)
  const root = getQianfanRelayRoot()
  const candidates = [
    path.join(root, 'dist', 'win-unpacked', 'logs'),
    path.join(root, 'logs'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

export function getQianfanLocalApiPort(): number {
  return parsePort(process.env.QIANFAN_LOCAL_API_PORT, 9323, 'QIANFAN_LOCAL_API_PORT')
}

export function getQianfanLocalApiUrl(): string {
  return process.env.QIANFAN_LOCAL_API_URL?.trim() || `http://127.0.0.1:${getQianfanLocalApiPort()}`
}

/** 本地助手离线判定阈值（毫秒） */
export function getAgentOfflineThresholdMs(): number {
  const v = Number(process.env.AGENT_OFFLINE_THRESHOLD_MS || 15000)
  return Number.isFinite(v) && v > 3000 ? v : 15000
}

/** 记账系统 Web 地址 */
export function getJizhangWebUrl(): string {
  return (process.env.JIZHANG_WEB_URL || '').trim()
}

/** 主播分析 Web 地址 */
export function getZhuboAnalysisWebUrl(): string {
  return (process.env.ZHUBO_ANALYSIS_WEB_URL || '').trim()
}

export function isQianfanRelayRootAvailable(): boolean {
  try {
    return fs.existsSync(getQianfanRelayRoot())
  } catch {
    return false
  }
}
