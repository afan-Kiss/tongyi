/**
 * 启动前端口预检（supervisor 使用，与 apps/server port-planner 逻辑一致）
 */
const net = require('node:net')

const FALLBACK_BASES = [1212, 1312, 1412]

function buildPorts(base) {
  return {
    main: base + 0,
    xiangyuWeb: base + 1,
    xiangyuBridge: base + 2,
    excelBridge: base + 3,
    printAgent: base + 4,
    scannerApi: base + 5,
    mobileHttps: base + 6,
    localAgentWs: base + 7,
    localAgentHttp: base + 8,
    qianfanRelayProxy: base + 9,
    diagnostics: base + 10,
  }
}

function canBindPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', (err) => {
      resolve({ ok: false, reason: err.code || 'unknown', error: err.message })
    })
    server.once('listening', () => {
      server.close(() => resolve({ ok: true }))
    })
    server.listen(port, host)
  })
}

async function canBindGroup(base) {
  const ports = Object.values(buildPorts(base))
  for (const p of ports) {
    const r = await canBindPort(p)
    if (!r.ok) return { ok: false, port: p, reason: r.reason }
  }
  return { ok: true }
}

async function resolvePlan() {
  const warnings = []
  const explicit = process.env.TONGYI_PORT_BASE?.trim() || process.env.PORT?.trim()
  if (explicit) {
    const base = Number(explicit)
    if (!Number.isInteger(base) || base < 1) return null
    const main = await canBindPort(base)
    if (!main.ok) return null
    const group = await canBindGroup(base)
    if (!group.ok) return null
    return { basePort: base, source: 'env', ports: buildPorts(base), warnings }
  }

  for (let i = 0; i < FALLBACK_BASES.length; i++) {
    const base = FALLBACK_BASES[i]
    const main = await canBindPort(base)
    if (!main.ok) {
      if (main.reason === 'EACCES' && base === 1212) {
        warnings.push('当前端口被 Windows 系统保留，已自动尝试备用端口 1312。')
      }
      continue
    }
    const group = await canBindGroup(base)
    if (!group.ok) continue
    return {
      basePort: base,
      source: i === 0 ? 'preferred' : 'windows-fallback',
      ports: buildPorts(base),
      warnings,
    }
  }
  return null
}

function applyEnv(plan) {
  process.env.PORT = String(plan.ports.main)
  process.env.TONGYI_PORT_BASE = String(plan.basePort)
  process.env.XIANGYU_PORT = String(plan.ports.xiangyuWeb)
  process.env.XIANGYU_BRIDGE_PORT = String(plan.ports.xiangyuBridge)
  process.env.EXCEL_BRIDGE_URL = `http://127.0.0.1:${plan.ports.excelBridge}`
  process.env.PRINT_AGENT_URL = `http://127.0.0.1:${plan.ports.printAgent}`
  process.env.SCANNER_API_PORT = String(plan.ports.scannerApi)
  process.env.MOBILE_HTTPS_PORT = String(plan.ports.mobileHttps)
}

module.exports = { resolvePlan, applyEnv }

if (require.main === module) {
  resolvePlan()
    .then((plan) => {
      if (!plan) process.exit(2)
      applyEnv(plan)
      process.stdout.write(`${JSON.stringify(plan)}\n`)
    })
    .catch(() => process.exit(2))
}
