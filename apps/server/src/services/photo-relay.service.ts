import { randomUUID } from 'node:crypto'
import { normalizeCertNo } from '../domain/inventory.rules'

const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const PHONE_ONLINE_MS = 5000

interface RelayPhoto {
  seq: number
  dataUrl: string
  at: number
}

interface PhotoRelaySession {
  id: string
  certNo: string
  latestFrame: string | null
  frameAt: number
  photos: RelayPhoto[]
  photoSeq: number
  phoneLastSeen: number
  pcLastSeen: number
  createdAt: number
  updatedAt: number
}

const sessions = new Map<string, PhotoRelaySession>()

function touch(session: PhotoRelaySession) {
  session.updatedAt = Date.now()
}

function pruneSessions() {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id)
  }
}

setInterval(pruneSessions, 5 * 60 * 1000).unref()

function newSession(id: string, certNo = ''): PhotoRelaySession {
  const now = Date.now()
  return {
    id,
    certNo,
    latestFrame: null,
    frameAt: 0,
    photos: [],
    photoSeq: 0,
    phoneLastSeen: 0,
    pcLastSeen: now,
    createdAt: now,
    updatedAt: now,
  }
}

/** 工作台会话：手机扫一次码，可连续录入多条 */
export function getOrCreateStationSession(stationId?: string) {
  const id = (stationId || '').trim() || randomUUID().slice(0, 12)
  const existing = sessions.get(id)
  if (existing) {
    touch(existing)
    return { ok: true as const, sessionId: existing.id, certNo: existing.certNo, created: false }
  }
  const session = newSession(id)
  sessions.set(id, session)
  return { ok: true as const, sessionId: id, certNo: '', created: true }
}

/** @deprecated 保留兼容；新流程请用 getOrCreateStationSession + setPhotoRelayActiveCert */
export function createPhotoRelaySession(certNo: string) {
  const code = normalizeCertNo(certNo)
  if (!code) return { ok: false as const, message: '编号无效' }
  const station = getOrCreateStationSession()
  const sync = setPhotoRelayActiveCert(station.sessionId, code)
  if (!sync.ok) return sync
  return { ok: true as const, sessionId: station.sessionId, certNo: code }
}

export function setPhotoRelayActiveCert(
  sessionId: string,
  certNo: string,
  opts?: { ackPhotos?: boolean },
) {
  const code = normalizeCertNo(certNo)
  if (!code) return { ok: false as const, message: '编号无效' }
  const session = sessions.get(sessionId)
  if (!session) return { ok: false as const, message: '会话不存在或已过期' }
  const changed = session.certNo !== code
  if (changed) {
    session.certNo = code
    session.photos = []
    session.photoSeq = 0
  } else if (opts?.ackPhotos) {
    // 库存编辑等：确认已消费 relay 缓冲，避免重开编辑时重复拉取
    session.photos = []
  }
  session.pcLastSeen = Date.now()
  touch(session)
  return { ok: true as const, certNo: code, changed, photoSeq: session.photoSeq }
}

export function getPhotoRelaySession(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return null
  touch(session)
  return session
}

export function heartbeatPhotoRelay(sessionId: string, role: 'phone' | 'pc') {
  const session = sessions.get(sessionId)
  if (!session) return { ok: false as const, message: '会话不存在或已过期' }
  const now = Date.now()
  if (role === 'phone') session.phoneLastSeen = now
  else session.pcLastSeen = now
  touch(session)
  return {
    ok: true as const,
    certNo: session.certNo,
    phoneOnline: now - session.phoneLastSeen < PHONE_ONLINE_MS,
  }
}

export function updatePhotoRelayFrame(sessionId: string, frame: string) {
  const session = sessions.get(sessionId)
  if (!session) return { ok: false as const, message: '会话不存在或已过期' }
  session.latestFrame = frame
  session.frameAt = Date.now()
  session.phoneLastSeen = Date.now()
  touch(session)
  return { ok: true as const }
}

export function addPhotoRelayShot(sessionId: string, photo: string) {
  const session = sessions.get(sessionId)
  if (!session) return { ok: false as const, message: '会话不存在或已过期' }
  if (!session.certNo) return { ok: false as const, message: '请先在电脑填写编号' }
  session.photoSeq += 1
  const entry: RelayPhoto = { seq: session.photoSeq, dataUrl: photo, at: Date.now() }
  session.photos.push(entry)
  if (session.photos.length > 30) session.photos.splice(0, session.photos.length - 30)
  session.phoneLastSeen = Date.now()
  touch(session)
  return { ok: true as const, seq: entry.seq }
}

export function pollPhotoRelay(sessionId: string, lastPhotoSeq: number) {
  const session = sessions.get(sessionId)
  if (!session) return { ok: false as const, message: '会话不存在或已过期' }
  session.pcLastSeen = Date.now()
  touch(session)
  const now = Date.now()
  return {
    ok: true as const,
    certNo: session.certNo,
    frame: session.latestFrame,
    frameAt: session.frameAt,
    phoneOnline: now - session.phoneLastSeen < PHONE_ONLINE_MS,
    photos: session.photos.filter((p) => p.seq > lastPhotoSeq),
    photoSeq: session.photoSeq,
  }
}
