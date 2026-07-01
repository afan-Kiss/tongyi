import { request, upload, publicRequest, PRINT_TIMEOUT_MS } from './client'
import type { UserActivityLogRow } from '@/lib/userActivity'
import type {
  AppSettings,
  Bracelet,
  DashboardStats,
  ExcelSyncResult,
  InboundBody,
  LabelTemplate,
  ListResult,
  NewBraceletBody,
  OpResult,
  OutboundBody,
  SystemStatus,
} from './types'

/** 前端 API 层 — 只负责 HTTP 调用，不含业务逻辑 */

export const authApi = {
  license: () =>
    request<{ data: { allowed: boolean; message: string; switchValue?: '开' | '关' | null } }>(
      '/auth/license',
    ),
  status: () =>
    request<{
      data: {
        authed: boolean
        username: string
        displayName?: string
        license?: { allowed: boolean; message: string; switchValue?: '开' | '关' | null }
      }
    }>('/auth/status'),
  profile: () =>
    request<{ data: { username: string; displayName: string } }>('/auth/profile'),
  saveProfile: (displayName: string) =>
    request<{ data: { username: string; displayName: string } }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ displayName }),
    }),
  login: (username: string, password: string) =>
    request<{ data: { username: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ data: { loggedOut: boolean } }>('/auth/logout', { method: 'POST' }),
}

export const inventoryApi = {
  stats: () => request<{ data: DashboardStats }>('/inventory/stats'),
  prefixStats: (params: Record<string, string | number>) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => q.set(k, String(v)))
    return request<{ data: { prefix: string; count: number }[] }>(`/inventory/prefix-stats?${q}`)
  },
  list: (params: Record<string, string | number>) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => q.set(k, String(v)))
    return request<{ data: ListResult }>(`/inventory?${q}`)
  },
  getByCert: (certNo: string, opts?: { dbOnly?: boolean }) => {
    const q = opts?.dbOnly ? '?dbOnly=1' : ''
    return request<{ data: Bracelet }>(`/inventory/by-cert/${encodeURIComponent(certNo)}${q}`)
  },
  scanLookup: (code: string, opts?: { dbOnly?: boolean; includeList?: boolean; importFromExcel?: boolean }) => {
    const q = new URLSearchParams()
    if (opts?.dbOnly) q.set('dbOnly', '1')
    if (opts?.includeList) q.set('includeList', '1')
    if (opts?.importFromExcel) q.set('importFromExcel', '1')
    const qs = q.toString()
    return request<{
      data: {
        items: Bracelet[]
        importedFromExcel?: boolean
        excelSource?: 'cache' | 'live' | null
        needsPhoto?: boolean
      }
    }>(
      `/inventory/by-scan/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`,
    )
  },
  updateByCert: (certNo: string, body: Record<string, unknown>) =>
    request<{ data: { bracelet: Bracelet; excelSync: ExcelSyncResult; partialSuccess?: boolean } }>(
      `/inventory/by-cert/${encodeURIComponent(certNo)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  deleteByCert: (certNo: string) =>
    request<{ data: { certNo: string } }>(`/inventory/by-cert/${encodeURIComponent(certNo)}`, {
      method: 'DELETE',
    }),
}

export const operationsApi = {
  outbound: (body: OutboundBody) =>
    request<{ data: OpResult }>('/operations/outbound', { method: 'POST', body: JSON.stringify(body) }),
  inbound: (body: InboundBody) =>
    request<{ data: OpResult }>('/operations/inbound', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: NewBraceletBody) =>
    request<{ data: OpResult }>('/operations/register', { method: 'POST', body: JSON.stringify(body) }),
  excelRow: (certNo: string) =>
    request<{ data: import('./types').ExcelRowPreview }>(`/operations/excel-row/${encodeURIComponent(certNo)}`),
  createNew: (body: NewBraceletBody) =>
    request<{ data: OpResult }>('/operations/new', { method: 'POST', body: JSON.stringify(body) }),
  nextCertNo: (prefix?: string) => {
    const q = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
    return request<{ data: { certNo: string; prefix: string; source: string } }>(`/operations/next-cert-no${q}`)
  },
  revert: (logId: string) =>
    request(`/operations/revert/${logId}`, { method: 'POST' }),
  retryExcel: (logId: string) =>
    request<{ data: OpResult }>(`/operations/retry-excel/${logId}`, { method: 'POST' }),
  excelSnapshot: (certNo: string, refresh = false) =>
    request<{ data: ExcelSyncResult }>(
      `/operations/excel-snapshot/${encodeURIComponent(certNo)}${refresh ? '?refresh=1' : ''}`,
    ),
}

export const mediaApi = {
  upload: (certNo: string, file: File) => {
    const fd = new FormData()
    fd.append('certNo', certNo)
    fd.append('file', file)
    return upload('/media/upload', fd)
  },
  delete: (assetId: string) =>
    request<{ data: { id: string } }>(`/media/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
}

export const settingsApi = {
  get: () => request<{ data: AppSettings }>('/settings'),
  save: (body: Partial<AppSettings>) =>
    request<{ data: AppSettings }>('/settings', { method: 'PUT', body: JSON.stringify(body) }),
  status: () => request<{ data: SystemStatus }>('/settings/status'),
  restartPrintAgent: () =>
    request<{ data: { ok: boolean; message: string } }>('/settings/restart-print-agent', {
      method: 'POST',
    }),
  excelBridge: () => request<{ data: { online: boolean; message: string } }>('/settings/excel-bridge'),
  labelTemplate: {
    get: () => request<{ data: LabelTemplate }>('/settings/label-template'),
    save: (body: Partial<LabelTemplate>) =>
      request('/settings/label-template', { method: 'PUT', body: JSON.stringify(body) }),
  },
}

export const excelApi = {
  export: () => window.open('/api/v1/excel/export', '_blank'),
  import: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return upload('/excel/import', fd)
  },
  certIndexStatus: () => request<{ data: import('./types').CertIndexStatus }>('/excel/cert-index/status'),
  refreshCertIndex: () =>
    request<{ data: import('./types').CertIndexStatus }>('/excel/cert-index/refresh', { method: 'POST' }),
  searchCertIndex: (q: string, limit = 20) => {
    const params = new URLSearchParams({ q, limit: String(limit) })
    return request<{ data: { items: import('./types').CertIndexEntry[] } }>(`/excel/cert-index/search?${params}`)
  },
}

export const detailApi = {
  get: (certNo: string) =>
    request<{ data: import('./types').Bracelet }>(`/detail/${encodeURIComponent(certNo)}`),
  save: (certNo: string, body: Partial<import('./types').BraceletDetail>) =>
    request(`/detail/${encodeURIComponent(certNo)}`, { method: 'PUT', body: JSON.stringify(body) }),
}

export const printApi = {
  braceletTag: (body: {
    bracelet: import('./types').Bracelet
    template?: import('./types').LabelTemplate
    printerName?: string
    side?: 'front' | 'back' | 'both'
  }) =>
    request<{ ok: boolean; message: string; printer?: string; printed?: string[] }>(
      '/print/bracelet-tag',
      {
        method: 'POST',
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(PRINT_TIMEOUT_MS),
      },
    ),
  label: (body: Record<string, unknown>) =>
    request('/print/label', {
      method: 'POST',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PRINT_TIMEOUT_MS),
    }),
}

export const healthApi = {
  check: () => request<{ ok: boolean }>('/health'),
}

export const photoRelayApi = {
  mobileInfo: () =>
    publicRequest<{
      data: { lanIps: string[]; port: number; mobileHttpsPort: number; mobileHttpsEnabled: boolean }
    }>('/photo-relay/mobile-info'),
  station: (stationId?: string) =>
    publicRequest<{
      data: { sessionId: string; certNo: string; created: boolean; mobileUrl?: string }
    }>('/photo-relay/station', {
      method: 'POST',
      body: JSON.stringify({ stationId: stationId || undefined }),
    }),
  syncCert: (sessionId: string, certNo: string, ackPhotos?: boolean) =>
    request<{ data: { certNo: string; changed: boolean; photoSeq: number } }>(
      `/photo-relay/${encodeURIComponent(sessionId)}/cert`,
      { method: 'PATCH', body: JSON.stringify({ certNo, ackPhotos: ackPhotos === true }) },
    ),
  create: (certNo: string) =>
    publicRequest<{ data: { sessionId: string; certNo: string } }>('/photo-relay', {
      method: 'POST',
      body: JSON.stringify({ certNo }),
    }),
  poll: (sessionId: string, lastPhotoSeq = 0) =>
    request<{
      data: {
        certNo: string
        frame: string | null
        frameAt: number
        phoneOnline: boolean
        photos: { seq: number; dataUrl: string; at: number }[]
        photoSeq: number
      }
    }>(`/photo-relay/${encodeURIComponent(sessionId)}/poll?lastPhotoSeq=${lastPhotoSeq}`),
  heartbeat: (sessionId: string, role: 'phone' | 'pc') =>
    publicRequest<{ data: { certNo: string; phoneOnline: boolean } }>(
      `/photo-relay/${encodeURIComponent(sessionId)}/heartbeat`,
      { method: 'POST', body: JSON.stringify({ role }) },
    ),
  pushFrame: (sessionId: string, frame: string) =>
    publicRequest(`/photo-relay/${encodeURIComponent(sessionId)}/frame`, {
      method: 'POST',
      body: JSON.stringify({ frame }),
    }),
  shoot: (sessionId: string, photo: string) =>
    publicRequest<{ data: { seq: number } }>(`/photo-relay/${encodeURIComponent(sessionId)}/shoot`, {
      method: 'POST',
      body: JSON.stringify({ photo }),
    }),
  get: (sessionId: string) =>
    publicRequest<{ data: { sessionId: string; certNo: string; phoneOnline: boolean } }>(
      `/photo-relay/${encodeURIComponent(sessionId)}`,
    ),
}

export const platformApi = {
  agentStatus: () => request<{ data: import('./types').AgentOverview }>('/agent/status'),
  agentTasks: (limit = 50) => request<{ data: { tasks: import('./types').AgentTaskView[] } }>(`/agent/tasks?limit=${limit}`),
  retryAgentTask: (id: string) => request(`/agent/tasks/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  qianfanStatus: () => request<{ data: import('./types').QianfanRelaySnapshot }>('/qianfan-relay/status'),
  qianfanDiagnose: () => request<{ data: import('./types').QianfanDiagnoseResult }>('/qianfan-relay/diagnose', { method: 'POST' }),
  qianfanStart: () => request<{ data: { queued: boolean; message: string }; message?: string }>('/qianfan-relay/start', { method: 'POST' }),
  qianfanStop: () => request<{ data: { queued: boolean; message: string }; message?: string }>('/qianfan-relay/stop', { method: 'POST' }),
  qianfanRestart: () => request<{ data: { queued: boolean; message: string }; message?: string }>('/qianfan-relay/restart', { method: 'POST' }),
  qianfanMessages: (limit = 20) => request<{ data: { recent: Record<string, unknown>[]; pending: Record<string, unknown>[] } }>(`/qianfan-relay/messages?limit=${limit}`),
  qianfanNotifications: (limit = 20) => request<{ data: { items: Record<string, unknown>[] } }>(`/qianfan-relay/notifications?limit=${limit}`),
  qianfanSendText: (body: { buyerNick: string; text: string; shopName?: string; appCid?: string }) =>
    request<{ data: { queued: boolean; message: string }; message?: string }>('/qianfan-relay/send-text', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  portalOverview: () => request<{ data: import('./types').PortalOverview }>('/portal/overview'),
  discoverySiblings: () => request<{ data: import('./types').DiscoveryScanResult }>('/system-discovery/siblings'),
  discoveryApply: (body: { confirm: boolean; overwrite?: boolean; paths?: Record<string, string> }) =>
    request<{ data: import('./types').DiscoveryApplyResult; message?: string }>('/system-discovery/apply', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}

export const auditApi = {
  logs: (params: {
    page?: number
    pageSize?: number
    username?: string
    category?: string
    q?: string
    from?: string
    to?: string
  }) => {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('pageSize', String(params.pageSize))
    if (params.username) q.set('username', params.username)
    if (params.category) q.set('category', params.category)
    if (params.q) q.set('q', params.q)
    if (params.from) q.set('from', params.from)
    if (params.to) q.set('to', params.to)
    return request<{
      data: {
        items: UserActivityLogRow[]
        total: number
        page: number
        pageSize: number
      }
    }>(`/audit/logs?${q}`)
  },
}
