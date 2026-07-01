import net from 'node:net'

export type PortBindFailure = 'EACCES' | 'EADDRINUSE' | 'unknown'

export interface PortBindResult {
  ok: boolean
  reason?: PortBindFailure
  error?: string
}

export interface PortPlanPorts {
  main: number
  xiangyuWeb: number
  xiangyuBridge: number
  excelBridge: number
  printAgent: number
  scannerApi: number
  mobileHttps: number
  localAgentWs: number
  localAgentHttp: number
  qianfanRelayProxy: number
  diagnostics: number
}

export interface PortPlan {
  basePort: number
  source: 'preferred' | 'windows-fallback' | 'auto-fallback' | 'env'
  ports: PortPlanPorts
  warnings: string[]
}

export const PREFERRED_PORT_BASE = 1212
export const FALLBACK_PORT_BASES = [1212, 1312, 1412, 9000, 9100, 9200, 10012] as const

export function buildPortsFromBase(basePort: number): PortPlanPorts {
  return {
    main: basePort + 0,
    xiangyuWeb: basePort + 1,
    xiangyuBridge: basePort + 2,
    excelBridge: basePort + 3,
    printAgent: basePort + 4,
    scannerApi: basePort + 5,
    mobileHttps: basePort + 6,
    localAgentWs: basePort + 7,
    localAgentHttp: basePort + 8,
    qianfanRelayProxy: basePort + 9,
    diagnostics: basePort + 10,
  }
}

export function canBindPort(port: number, host = '127.0.0.1'): Promise<PortBindResult> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES') resolve({ ok: false, reason: 'EACCES', error: err.message })
      else if (err.code === 'EADDRINUSE') resolve({ ok: false, reason: 'EADDRINUSE', error: err.message })
      else resolve({ ok: false, reason: 'unknown', error: err.message })
    })
    server.once('listening', () => {
      server.close(() => resolve({ ok: true }))
    })
    server.listen(port, host)
  })
}

async function canBindPortGroup(basePort: number): Promise<{ ok: boolean; failures: number[] }> {
  const ports = Object.values(buildPortsFromBase(basePort))
  const failures: number[] = []
  for (const p of ports) {
    const r = await canBindPort(p)
    if (!r.ok) failures.push(p)
  }
  return { ok: failures.length === 0, failures }
}

function parseExplicitBase(): number | null {
  const raw = process.env.TONGYI_PORT_BASE?.trim() || process.env.PORT?.trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return null
  return n
}

export async function resolvePortPlan(): Promise<PortPlan | null> {
  const warnings: string[] = []
  const explicitBase = parseExplicitBase()

  if (explicitBase) {
    const mainCheck = await canBindPort(explicitBase)
    if (!mainCheck.ok) {
      console.error(
        `[port-planner] 指定端口 ${explicitBase} 不可用（${mainCheck.reason || 'unknown'}）。请更换 PORT / TONGYI_PORT_BASE 或释放占用。`,
      )
      return null
    }
    const group = await canBindPortGroup(explicitBase)
    if (!group.ok) {
      console.error(`[port-planner] 指定端口组 ${explicitBase} 冲突端口: ${group.failures.join(', ')}`)
      return null
    }
    return {
      basePort: explicitBase,
      source: 'env',
      ports: buildPortsFromBase(explicitBase),
      warnings,
    }
  }

  for (let i = 0; i < FALLBACK_PORT_BASES.length; i++) {
    const base = FALLBACK_PORT_BASES[i]
    const mainCheck = await canBindPort(base)
    if (!mainCheck.ok) {
      if (mainCheck.reason === 'EACCES' && base === PREFERRED_PORT_BASE) {
        warnings.push('当前端口被 Windows 系统保留，已自动尝试备用端口 1312。')
      }
      continue
    }
    const group = await canBindPortGroup(base)
    if (!group.ok) continue

    const source =
      i === 0 ? 'preferred' : base <= 1412 ? 'windows-fallback' : 'auto-fallback'
    if (source === 'windows-fallback') {
      warnings.push(`1212 不可用，已自动切换到备用端口组 ${base}。`)
    }
    if (source === 'auto-fallback') {
      warnings.push(`1212/1312/1412 均不可用，已自动切换到端口组 ${base}。`)
    }
    return {
      basePort: base,
      source,
      ports: buildPortsFromBase(base),
      warnings,
    }
  }

  console.error('[port-planner] 1212 / 1312 / 1412 / 9000 / 9100 / 9200 / 10012 端口组均不可用，无法启动。')
  return null
}

export function applyPortPlanToProcessEnv(plan: PortPlan): void {
  const { ports } = plan
  process.env.PORT = String(ports.main)
  process.env.TONGYI_PORT_BASE = String(plan.basePort)
  process.env.XIANGYU_PORT = String(ports.xiangyuWeb)
  process.env.XIANGYU_BRIDGE_PORT = String(ports.xiangyuBridge)
  process.env.EXCEL_BRIDGE_URL = `http://127.0.0.1:${ports.excelBridge}`
  process.env.PRINT_AGENT_URL = `http://127.0.0.1:${ports.printAgent}`
  process.env.SCANNER_API_PORT = String(ports.scannerApi)
  process.env.MOBILE_HTTPS_PORT = String(ports.mobileHttps)
}

let cachedPortPlan: PortPlan | null = null

export async function initPortPlan(): Promise<PortPlan> {
  if (cachedPortPlan) return cachedPortPlan
  const plan = await resolvePortPlan()
  if (!plan) {
    throw new Error('PORT_PLAN_UNAVAILABLE')
  }
  applyPortPlanToProcessEnv(plan)
  cachedPortPlan = plan
  return plan
}

export function getEffectivePortPlan(): PortPlan {
  if (cachedPortPlan) return cachedPortPlan
  return {
    basePort: PREFERRED_PORT_BASE,
    source: 'preferred',
    ports: buildPortsFromBase(PREFERRED_PORT_BASE),
    warnings: [],
  }
}

export function resetPortPlanCache(): void {
  cachedPortPlan = null
}
