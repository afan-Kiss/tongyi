import { randomUUID } from 'node:crypto'
import type { Request } from 'express'
import { prisma } from '../lib/prisma'
import { getClientIp, getClientUserAgent } from '../lib/client-ip'
import { getUserDisplayName, isAdminUser } from './auth.service'

export const AUDIT_VIEWER_USERNAME = 'fanfan'

export type ActivityCategory = 'auth' | 'navigation' | 'click' | 'api' | 'action'

export interface ActivityInput {
  username?: string | null
  category: ActivityCategory | string
  action: string
  path?: string | null
  detail?: Record<string, unknown> | null
  ip?: string | null
  userAgent?: string | null
}

export interface ActivityListQuery {
  page?: number
  pageSize?: number
  username?: string
  category?: string
  q?: string
  from?: string
  to?: string
}

export function isAuditViewer(username?: string | null): boolean {
  return isAdminUser(username)
}

/** 操作日志展示名：优先各账号设置的 displayName，否则登录账号 */
function resolveActivityOperatorName(req: Request, explicit?: string | null): string | null {
  const fromInput = explicit ? String(explicit).trim() : ''
  if (fromInput) return fromInput
  const login = req.session?.username
  if (!login) return null
  const display = getUserDisplayName(login)
  return display || login
}

function safeJson(value: Record<string, unknown> | null | undefined): string {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

export async function recordUserActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.userActivityLog.create({
      data: {
        id: randomUUID(),
        username: input.username ? String(input.username).trim() : null,
        category: String(input.category || 'action').slice(0, 32),
        action: String(input.action || 'unknown').slice(0, 200),
        path: input.path ? String(input.path).slice(0, 500) : null,
        detailJson: safeJson(input.detail),
        ip: input.ip ? String(input.ip).slice(0, 64) : null,
        userAgent: input.userAgent ? String(input.userAgent).slice(0, 512) : null,
      },
    })
  } catch (err) {
    console.warn('[audit] 写入用户操作日志失败:', err instanceof Error ? err.message : err)
  }
}

export function recordUserActivityFromRequest(
  req: Request,
  input: Omit<ActivityInput, 'ip' | 'userAgent' | 'username'> & { username?: string | null },
): void {
  void recordUserActivity({
    ...input,
    username: resolveActivityOperatorName(req, input.username),
    ip: getClientIp(req),
    userAgent: getClientUserAgent(req),
  })
}

export async function recordUserActivitiesBatch(
  req: Request,
  events: ActivityInput[],
): Promise<number> {
  const sessionOperator = resolveActivityOperatorName(req)
  const ip = getClientIp(req)
  const userAgent = getClientUserAgent(req)
  const rows = events
    .slice(0, 50)
    .map((ev) => ({
      id: randomUUID(),
      username: ev.username ? String(ev.username).trim() : sessionOperator,
      category: String(ev.category || 'action').slice(0, 32),
      action: String(ev.action || 'unknown').slice(0, 200),
      path: ev.path ? String(ev.path).slice(0, 500) : null,
      detailJson: safeJson(ev.detail),
      ip: ev.ip ?? ip,
      userAgent: ev.userAgent ?? userAgent,
    }))
  if (!rows.length) return 0
  await prisma.userActivityLog.createMany({ data: rows })
  return rows.length
}

export async function listUserActivities(query: ActivityListQuery) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 30))
  const where: {
    username?: { contains: string }
    category?: string
    createdAt?: { gte?: Date; lte?: Date }
    OR?: Array<{ action?: { contains: string }; path?: { contains: string }; detailJson?: { contains: string } }>
  } = {}

  const username = String(query.username || '').trim()
  if (username) where.username = { contains: username }

  const category = String(query.category || '').trim()
  if (category) where.category = category

  const q = String(query.q || '').trim()
  if (q) {
    where.OR = [
      { action: { contains: q } },
      { path: { contains: q } },
      { detailJson: { contains: q } },
    ]
  }

  if (query.from) {
    const from = new Date(query.from)
    if (!Number.isNaN(from.getTime())) {
      where.createdAt = { ...where.createdAt, gte: from }
    }
  }
  if (query.to) {
    const to = new Date(query.to)
    if (!Number.isNaN(to.getTime())) {
      where.createdAt = { ...where.createdAt, lte: to }
    }
  }

  const [items, total] = await Promise.all([
    prisma.userActivityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.userActivityLog.count({ where }),
  ])

  return {
    items: items.map((row) => ({
      id: row.id,
      username: row.username,
      category: row.category,
      action: row.action,
      path: row.path,
      detail: parseDetail(row.detailJson),
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  }
}

function parseDetail(raw: string): Record<string, unknown> {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

const SKIP_API_LOG_RE =
  /^\/photo-relay\/[^/]+\/(poll|heartbeat|frame)(\/|$)|^\/audit\/events$|^\/audit\/logs$|^\/health$/

export function shouldSkipApiAuditLog(method: string, apiPath: string): boolean {
  if (SKIP_API_LOG_RE.test(apiPath)) return true
  if (method === 'GET' && /^\/inventory(\?|$)/.test(apiPath)) return false
  if (method === 'GET' && /\/poll|\/heartbeat|\/frame|\/status$/.test(apiPath)) return true
  return false
}

export function buildApiAuditAction(method: string, apiPath: string, statusCode: number): string {
  return `${method} ${apiPath} → ${statusCode}`
}
