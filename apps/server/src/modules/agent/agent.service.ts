import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { getClientIp } from '../../lib/client-ip'
import { getAgentOfflineThresholdMs } from '../../config/env'
import type { AgentMachineView, AgentRegisterBody } from './agent.types'
import { AGENT_MACHINE_STATUS_LABELS as MACHINE_LABELS } from './agent.types'

const TOKEN_HEADER = 'x-agent-token'

export function hashAgentToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateAgentToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function isMachineOnline(lastSeenAt: Date | null | undefined): boolean {
  if (!lastSeenAt) return false
  return Date.now() - lastSeenAt.getTime() < getAgentOfflineThresholdMs()
}

export function toMachineView(row: {
  id: string
  name: string
  machineCode: string
  status: string
  lastSeenAt: Date | null
  version: string | null
  ip: string | null
  capabilities: string
}): AgentMachineView {
  let capabilities: string[] = []
  try {
    const parsed = JSON.parse(row.capabilities)
    capabilities = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
  } catch {
    capabilities = []
  }
  const online = isMachineOnline(row.lastSeenAt)
  const status = online ? (row.status === 'busy' ? 'busy' : 'online') : 'offline'
  return {
    id: row.id,
    name: row.name,
    machineCode: row.machineCode,
    status,
    statusLabel: MACHINE_LABELS[status] || status,
    lastSeenAt: row.lastSeenAt?.toISOString() || null,
    version: row.version,
    ip: row.ip,
    capabilities,
    online,
  }
}

export async function registerAgent(body: AgentRegisterBody, req: Request) {
  const machineCode = String(body.machineCode || '').trim()
  if (!machineCode) throw new Error('缺少 machineCode')

  const name = String(body.name || machineCode).trim() || machineCode
  const version = body.version?.trim() || null
  const ip = body.ip?.trim() || getClientIp(req) || null
  const capabilities = JSON.stringify(
    Array.isArray(body.capabilities) ? body.capabilities.filter((x) => typeof x === 'string') : [],
  )

  const token = generateAgentToken()
  const tokenHash = hashAgentToken(token)

  const existing = await prisma.agentMachine.findUnique({ where: { machineCode } })
  const row = existing
    ? await prisma.agentMachine.update({
        where: { machineCode },
        data: {
          name,
          version,
          ip,
          capabilities,
          tokenHash,
          status: 'online',
          lastSeenAt: new Date(),
        },
      })
    : await prisma.agentMachine.create({
        data: {
          name,
          machineCode,
          version,
          ip,
          capabilities,
          tokenHash,
          status: 'online',
          lastSeenAt: new Date(),
        },
      })

  return {
    machine: toMachineView(row),
    token,
  }
}

export async function resolveAgentFromRequest(req: Request) {
  const token = String(req.headers[TOKEN_HEADER] || req.headers[TOKEN_HEADER.toUpperCase()] || '').trim()
  if (!token) return null
  const tokenHash = hashAgentToken(token)
  const row = await prisma.agentMachine.findFirst({ where: { tokenHash } })
  if (!row) return null
  return row
}

export function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const row = await resolveAgentFromRequest(req)
      if (!row) {
        res.status(401).json({ ok: false, message: '本地助手认证失败，请重新注册' })
        return
      }
      ;(req as Request & { agentMachine?: typeof row }).agentMachine = row
      next()
    } catch (err) {
      res.status(500).json({
        ok: false,
        message: err instanceof Error ? err.message : '本地助手认证异常',
      })
    }
  })()
}

export async function listAgentMachines(): Promise<AgentMachineView[]> {
  const rows = await prisma.agentMachine.findMany({ orderBy: { updatedAt: 'desc' } })
  return rows.map(toMachineView)
}

export async function getAgentOverview() {
  const machines = await listAgentMachines()
  const onlineCount = machines.filter((m) => m.online).length
  const recentTasks = await prisma.agentTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { machine: true },
  })

  return {
    machines,
    onlineCount,
    totalCount: machines.length,
    hasOnlineAgent: onlineCount > 0,
    summary: onlineCount > 0 ? `${onlineCount} 台本地助手在线` : '本地助手离线，Excel/打印/千帆操作需在本机运行助手',
  }
}
