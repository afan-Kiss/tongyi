import os from 'node:os'
import { prisma } from '../lib/prisma'
import { checkExcelBridgeHealth } from '../adapters/excel/excel-live.adapter'
import {
  getPort,
  getMobileHttpsPort,
  getXiangyuPort,
  getXiangyuWebUrl,
  isXiangyuEnabled,
  isExcelBridgeEnabled,
} from '../config/env'
import { isMobileHttpsEnabled } from '../lib/mobile-https'
import { XIANGYU_PROXY_PREFIX } from '../middleware/xiangyuProxy'
import {
  startExcelBridgeProcess,
  stopExcelBridgeProcess,
} from './process-manager.service'
import { getPrintAgentDisplayStatus } from './print-agent-recovery.service'

export interface AppSettingsData {
  excelBridgeEnabled: boolean
  publicUrl: string
  lanUrls: string[]
  defaultSalesPerson: string
  defaultSalesChannel: string
  printerName: string
  printerModel: string
  photoWatermark?: {
    enabled: boolean
    fontSizeBoost: number
  }
}

const DEFAULT_SETTINGS: AppSettingsData = {
  excelBridgeEnabled: true,
  publicUrl: 'https://churuku.duckdns.org:8443',
  lanUrls: [],
  defaultSalesPerson: '',
  defaultSalesChannel: '',
  printerName: '',
  printerModel: 'PUQU_AQ00',
  photoWatermark: { enabled: true, fontSizeBoost: 16 },
}

const VIRTUAL_IFACE_RE = /vEthernet|virtualbox|vmware|hyper-v|wsl|loopback|docker|npcap|tailscale|zerotier|bluetooth/i
const SKIP_LAN_IP_RE = /^169\.254\.|^192\.168\.240\.|^127\./

export function getLanIps(): string[] {
  const nets = os.networkInterfaces()
  const ips: string[] = []
  for (const name of Object.keys(nets)) {
    if (VIRTUAL_IFACE_RE.test(name)) continue
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        const addr = net.address
        if (SKIP_LAN_IP_RE.test(addr)) continue
        ips.push(addr)
      }
    }
  }
  return ips
}

export async function getSettings(): Promise<AppSettingsData> {
  const row = await prisma.appSettings.findUnique({ where: { id: 'singleton' } })
  if (!row) return { ...DEFAULT_SETTINGS, lanUrls: getLanIps() }
  const parsed = JSON.parse(row.json) as Partial<AppSettingsData>
  const merged = { ...DEFAULT_SETTINGS, ...parsed, lanUrls: getLanIps() }
  if (!merged.publicUrl) merged.publicUrl = DEFAULT_SETTINGS.publicUrl
  merged.photoWatermark = {
    ...DEFAULT_SETTINGS.photoWatermark!,
    ...(parsed.photoWatermark || {}),
  }
  return merged
}

export async function saveSettings(data: Partial<AppSettingsData>): Promise<AppSettingsData> {
  const current = await getSettings()
  const merged = { ...current, ...data, lanUrls: getLanIps() }
  await prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', json: JSON.stringify(merged) },
    update: { json: JSON.stringify(merged) },
  })

  const wasEnabled = process.env.EXCEL_BRIDGE_ENABLED !== 'false'
  const nowEnabled = merged.excelBridgeEnabled
  process.env.EXCEL_BRIDGE_ENABLED = nowEnabled ? 'true' : 'false'

  if (wasEnabled !== nowEnabled) {
    if (nowEnabled) startExcelBridgeProcess()
    else stopExcelBridgeProcess()
  }

  return merged
}

async function checkXiangyuHealth() {
  if (!isXiangyuEnabled()) {
    return {
      online: false,
      message: '祥钰系统已禁用',
      bridge: { online: false, message: '已禁用' },
    }
  }

  const base = getXiangyuWebUrl()
  try {
    const [webRes, bridgeRes] = await Promise.all([
      fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2500) })
        .then((r) => r.json() as Promise<{ ok?: boolean }>)
        .catch(() => ({ ok: false })),
      fetch(`${base}/api/bridge/health`, { signal: AbortSignal.timeout(2500) })
        .then((r) => r.json() as Promise<{ ok?: boolean; message?: string }>)
        .catch(() => ({ ok: false, message: 'Bridge 离线' })),
    ])

    const webOnline = !!webRes.ok
    const bridgeOnline = !!bridgeRes.ok
    return {
      online: webOnline,
      message: webOnline ? '祥钰 Web 在线' : '祥钰 Web 离线',
      bridge: {
        online: bridgeOnline,
        message: bridgeRes.message || (bridgeOnline ? 'Bridge 在线' : 'Bridge 离线'),
      },
    }
  } catch {
    return {
      online: false,
      message: '祥钰 Web 离线',
      bridge: { online: false, message: 'Bridge 离线' },
    }
  }
}

export async function getSystemStatus() {
  const [excelBridge, printAgent, xiangyu] = await Promise.all([
    checkExcelBridgeHealth(),
    getPrintAgentDisplayStatus(),
    checkXiangyuHealth(),
  ])
  const degradedReasons: string[] = []
  if (isExcelBridgeEnabled() && !excelBridge.online) {
    degradedReasons.push('Excel 桥接离线')
  }
  if (isXiangyuEnabled() && !xiangyu.online) {
    degradedReasons.push('祥钰 Web 离线')
  }
  if (isXiangyuEnabled() && xiangyu.bridge && !xiangyu.bridge.online) {
    degradedReasons.push('千帆 Bridge 离线')
  }

  return {
    lanIps: getLanIps(),
    port: getPort(),
    mobileHttpsPort: isMobileHttpsEnabled() ? getMobileHttpsPort() : 0,
    xiangyuPort: getXiangyuPort(),
    xiangyuWebUrl: getXiangyuWebUrl(),
    xiangyuProxyPath: XIANGYU_PROXY_PREFIX,
    degraded: degradedReasons.length > 0,
    degradedReasons,
    xiangyu,
    excelBridge,
    printAgent,
  }
}

export async function ensureDefaultLabelTemplate() {
  const existing = await prisma.labelTemplate.findFirst({ where: { isDefault: true } })
  if (existing) return existing
  return prisma.labelTemplate.create({
    data: {
      name: 'default',
      widthMm: 25,
      heightMm: 70,
      barcodeType: 'CODE128',
      isDefault: true,
      fieldsJson: JSON.stringify([
        { key: 'certNo', label: '编号', show: true, size: 12 },
        { key: 'ringSize', label: '圈口', show: true, size: 10 },
        { key: 'weightGram', label: '克重', show: true, size: 10 },
        { key: 'price', label: '价格', show: true, size: 10 },
        { key: 'barcode', label: '条码', show: true, size: 0 },
      ]),
    },
  })
}
