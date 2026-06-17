import { Router } from 'express'
import {
  addPhotoRelayShot,
  createPhotoRelaySession,
  getOrCreateStationSession,
  getPhotoRelaySession,
  heartbeatPhotoRelay,
  pollPhotoRelay,
  setPhotoRelayActiveCert,
  updatePhotoRelayFrame,
} from '../../services/photo-relay.service'
import { sendErr, sendOk } from '../../utils/api-response'

export const photoRelayRouter = Router()

photoRelayRouter.post('/station', (req, res) => {
  const result = getOrCreateStationSession(String(req.body?.stationId || ''))
  sendOk(res, { sessionId: result.sessionId, certNo: result.certNo, created: result.created })
})

photoRelayRouter.post('/', (req, res) => {
  const result = createPhotoRelaySession(String(req.body?.certNo || ''))
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, { sessionId: result.sessionId, certNo: result.certNo })
})

photoRelayRouter.patch('/:sessionId/cert', (req, res) => {
  const result = setPhotoRelayActiveCert(req.params.sessionId, String(req.body?.certNo || ''))
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, { certNo: result.certNo, changed: result.changed })
})

photoRelayRouter.get('/:sessionId', (req, res) => {
  const session = getPhotoRelaySession(req.params.sessionId)
  if (!session) return sendErr(res, '会话不存在或已过期', 404)
  const now = Date.now()
  sendOk(res, {
    sessionId: session.id,
    certNo: session.certNo,
    phoneOnline: now - session.phoneLastSeen < 5000,
    frameAt: session.frameAt,
    photoCount: session.photos.length,
  })
})

photoRelayRouter.get('/:sessionId/poll', (req, res) => {
  const lastPhotoSeq = Number(req.query.lastPhotoSeq || 0)
  const result = pollPhotoRelay(req.params.sessionId, lastPhotoSeq)
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, {
    certNo: result.certNo,
    frame: result.frame,
    frameAt: result.frameAt,
    phoneOnline: result.phoneOnline,
    photos: result.photos,
  })
})

photoRelayRouter.post('/:sessionId/heartbeat', (req, res) => {
  const role = req.body?.role === 'phone' ? 'phone' : 'pc'
  const result = heartbeatPhotoRelay(req.params.sessionId, role)
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, { certNo: result.certNo, phoneOnline: result.phoneOnline })
})

photoRelayRouter.post('/:sessionId/frame', (req, res) => {
  const frame = String(req.body?.frame || '')
  if (!frame.startsWith('data:image/')) return sendErr(res, '无效的画面数据')
  if (frame.length > 600_000) return sendErr(res, '画面数据过大')
  const result = updatePhotoRelayFrame(req.params.sessionId, frame)
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, { ok: true })
})

photoRelayRouter.post('/:sessionId/shoot', (req, res) => {
  const photo = String(req.body?.photo || '')
  if (!photo.startsWith('data:image/')) return sendErr(res, '无效的照片数据')
  if (photo.length > 4_000_000) return sendErr(res, '照片数据过大')
  const result = addPhotoRelayShot(req.params.sessionId, photo)
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, { seq: result.seq })
})
