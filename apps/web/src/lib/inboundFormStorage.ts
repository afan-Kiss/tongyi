import type { BraceletDetail } from '@/api/types'

export type InboundKind = 'register' | 'return'

const KIND_KEY = 'jade-inbound-kind-v1'
const NEW_KEY = 'jade-inbound-new-v1'
const RETURN_KEY = 'jade-inbound-return-v1'

export interface NewInboundMemory {
  arrivalDate: string
  batch: string
  category: string
  ringSize: string
  cost: string
  remark: string
  detail: Partial<BraceletDetail>
}

export interface ReturnInboundMemory {
  remarkText: string
}

const EMPTY_DETAIL: Partial<BraceletDetail> = {
  description: '',
}

export const DEFAULT_NEW_INBOUND: NewInboundMemory = {
  arrivalDate: new Date().toISOString().slice(0, 10),
  batch: '',
  category: '手镯',
  ringSize: '',
  cost: '',
  remark: '',
  detail: { ...EMPTY_DETAIL },
}

export const DEFAULT_RETURN_INBOUND: ReturnInboundMemory = {
  remarkText: '退货入库',
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) as Partial<T> }
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore quota */
  }
}

export function loadInboundKind(): InboundKind {
  try {
    const v = localStorage.getItem(KIND_KEY)
    if (v === 'return') return 'return'
    return 'register'
  } catch {
    return 'register'
  }
}

export function saveInboundKind(kind: InboundKind): void {
  writeJson(KIND_KEY, kind)
}

export function loadNewInboundMemory(): NewInboundMemory {
  const parsed = readJson(NEW_KEY, DEFAULT_NEW_INBOUND)
  return {
    ...DEFAULT_NEW_INBOUND,
    ...parsed,
    detail: { ...EMPTY_DETAIL, ...(parsed.detail || {}) },
  }
}

export function saveNewInboundMemory(data: NewInboundMemory): void {
  writeJson(NEW_KEY, data)
}

export function loadReturnInboundMemory(): ReturnInboundMemory {
  return readJson(RETURN_KEY, DEFAULT_RETURN_INBOUND)
}

export function saveReturnInboundMemory(data: ReturnInboundMemory): void {
  writeJson(RETURN_KEY, data)
}
