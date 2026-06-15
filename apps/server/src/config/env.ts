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



export function getPort(): number {

  return Number(process.env.PORT || DEFAULT_PORTS.main)

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

    return u.port ? Number(u.port) : DEFAULT_PORTS.excelBridge

  } catch {

    return DEFAULT_PORTS.excelBridge

  }

}



export function getPrintAgentUrl(): string {

  return process.env.PRINT_AGENT_URL || `http://127.0.0.1:${DEFAULT_PORTS.printAgent}`

}



export function isExcelBridgeEnabled(): boolean {

  return process.env.EXCEL_BRIDGE_ENABLED !== 'false'

}



/** 祥钰系统根目录（内置于 monorepo：apps/xiangyu） */
export function getXiangyuRoot(): string {
  const custom = process.env.XIANGYU_ROOT?.trim()
  if (custom) return path.resolve(custom)
  return path.join(MONOREPO_ROOT, 'apps/xiangyu')
}



export function getXiangyuPort(): number {

  return Number(process.env.XIANGYU_PORT || DEFAULT_PORTS.xiangyuWeb)

}



export function getXiangyuBridgePort(): number {

  return Number(process.env.XIANGYU_BRIDGE_PORT || DEFAULT_PORTS.xiangyuBridge)

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
    return Number(process.env.QIANFAN_DEVTOOLS_PORT)
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

  return process.env.XIANGYU_ENABLED !== 'false'

}



export const CERT_NO_REGEX =

  /^(?:DA|DB|DC|DD|DE|DF|DG|DH|DI|DK|DL|DM|DN|DP|DQ|DR|DW|ZQ|F|D)\d{3,8}$/i



export function getDefaultCertPrefix(): string {
  return (process.env.DEFAULT_CERT_PREFIX || 'F').trim().toUpperCase() || 'F'
}



export const DEFAULT_OUTBOUND_REMARK = '小红书发出'

