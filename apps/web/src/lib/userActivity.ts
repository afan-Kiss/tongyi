import { request } from '@/api/client'

export type ActivityCategory = 'auth' | 'navigation' | 'click' | 'api' | 'action'

export interface ActivityEventInput {
  category: ActivityCategory | string
  action: string
  path?: string
  detail?: Record<string, unknown>
}

export interface UserActivityLogRow {
  id: string
  username: string | null
  category: string
  action: string
  path: string | null
  detail: Record<string, unknown>
  ip: string | null
  userAgent: string | null
  createdAt: string
}

export interface UserActivityLogResult {
  items: UserActivityLogRow[]
  total: number
  page: number
  pageSize: number
}

const queue: ActivityEventInput[] = []
let flushTimer: number | null = null
let flushing = false

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    void flushActivityQueue()
  }, 2500)
}

export function trackActivity(event: ActivityEventInput) {
  if (typeof window === 'undefined') return
  queue.push(event)
  if (queue.length >= 20) {
    void flushActivityQueue()
    return
  }
  scheduleFlush()
}

export async function flushActivityQueue() {
  if (flushing || !queue.length) return
  flushing = true
  const batch = queue.splice(0, 50)
  try {
    await request<{ data: { accepted: number } }>('/audit/events', {
      method: 'POST',
      body: JSON.stringify({ events: batch }),
    })
  } catch {
    queue.unshift(...batch)
  } finally {
    flushing = false
    if (queue.length) scheduleFlush()
  }
}

export const AUDIT_VIEWER_USERNAME = 'fanfan'

export function isAuditViewer(username?: string | null): boolean {
  return String(username || '').trim().toLowerCase() === AUDIT_VIEWER_USERNAME
}

export const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  auth: '登录认证',
  navigation: '页面浏览',
  click: '点击操作',
  api: '接口请求',
  action: '其他',
}

export function formatActivityDetail(detail: Record<string, unknown>): string {
  const parts: string[] = []
  const text = detail.text ?? detail.label
  if (text) parts.push(String(text))
  if (detail.method) parts.push(String(detail.method))
  if (detail.status != null) parts.push(`状态 ${detail.status}`)
  if (detail.attemptedUsername) parts.push(`尝试账号 ${detail.attemptedUsername}`)
  if (detail.href) parts.push(String(detail.href))
  if (detail.tag) parts.push(`<${detail.tag}>`)
  if (!parts.length) {
    try {
      const raw = JSON.stringify(detail)
      return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
    } catch {
      return '—'
    }
  }
  return parts.join(' · ')
}

export function formatDateTimeSec(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}
