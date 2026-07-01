import type { Request } from 'express'
import { prisma } from '../../lib/prisma'
import { getClientIp } from '../../lib/client-ip'
import type { AgentHeartbeatBody } from './agent.types'
import { isMachineOnline } from './agent.service'

export async function recordAgentHeartbeat(
  machineId: string,
  body: AgentHeartbeatBody,
  req: Request,
) {
  const ip = getClientIp(req) || undefined
  const capabilities = Array.isArray(body.capabilities)
    ? JSON.stringify(body.capabilities.filter((x) => typeof x === 'string'))
    : undefined

  await prisma.agentMachine.update({
    where: { id: machineId },
    data: {
      status: body.status?.trim() || 'online',
      lastSeenAt: new Date(),
      version: body.version?.trim() || undefined,
      ip,
      capabilities,
    },
  })

  if (body.detail && typeof body.detail === 'object') {
    await prisma.systemModuleStatus.upsert({
      where: { moduleKey: `agent:${body.machineCode}` },
      create: {
        moduleKey: `agent:${body.machineCode}`,
        moduleName: `本地助手 ${body.machineCode}`,
        status: 'online',
        message: '心跳正常',
        lastOkAt: new Date(),
        detailJson: JSON.stringify(body.detail),
      },
      update: {
        status: 'online',
        message: '心跳正常',
        lastOkAt: new Date(),
        detailJson: JSON.stringify(body.detail),
      },
    })
  }

  return { ok: true, serverTime: new Date().toISOString() }
}

export async function markStaleAgentsOffline() {
  const rows = await prisma.agentMachine.findMany()
  const now = Date.now()
  for (const row of rows) {
    if (!row.lastSeenAt) continue
    if (isMachineOnline(row.lastSeenAt)) continue
    if (row.status === 'offline') continue
    await prisma.agentMachine.update({
      where: { id: row.id },
      data: { status: 'offline' },
    })
  }
}
