import { Router } from 'express'
import { buildMobileCameraUrl, getMobileCameraNetworkInfo } from '../../lib/mobile-camera-url'
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
import { getSettings } from '../../services/settings.service'
import { sendErr, sendOk } from '../../utils/api-response'

/** 预览帧 base64 上限（内网约 640px JPEG，留足余量） */
const RELAY_FRAME_MAX_CHARS = 8 * 1024 * 1024
/** 正式拍照 base64 上限 */
const RELAY_PHOTO_MAX_CHARS = 12 * 1024 * 1024

export const photoRelayRouter = Router()

photoRelayRouter.get('/mobile-info', (_req, res) => {
  sendOk(res, getMobileCameraNetworkInfo())
})

photoRelayRouter.post('/station', async (req, res) => {
  const result = getOrCreateStationSession(String(req.body?.stationId || ''))
  let publicUrl = ''
  try {
    publicUrl = (await getSettings()).publicUrl
  } catch {
    /* 设置读取失败时仍返回内网 URL */
  }
  const mobileUrl = buildMobileCameraUrl(result.sessionId, publicUrl)
  sendOk(res, {
    sessionId: result.sessionId,
    certNo: result.certNo,
    created: result.created,
    mobileUrl,
  })
})

photoRelayRouter.post('/', (req, res) => {
  const result = createPhotoRelaySession(String(req.body?.certNo || ''))
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, { sessionId: result.sessionId, certNo: result.certNo })
})

photoRelayRouter.patch('/:sessionId/cert', (req, res) => {
  const result = setPhotoRelayActiveCert(req.params.sessionId, String(req.body?.certNo || ''), {
    ackPhotos: req.body?.ackPhotos === true,
  })
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, { certNo: result.certNo, changed: result.changed, photoSeq: result.photoSeq })
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
    photoSeq: result.photoSeq,
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
  if (frame.length > RELAY_FRAME_MAX_CHARS) return sendErr(res, '画面数据过大')
  const result = updatePhotoRelayFrame(req.params.sessionId, frame)
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, { ok: true })
})

photoRelayRouter.post('/:sessionId/shoot', (req, res) => {
  const photo = String(req.body?.photo || '')
  if (!photo.startsWith('data:image/')) return sendErr(res, '无效的照片数据')
  if (photo.length > RELAY_PHOTO_MAX_CHARS) return sendErr(res, '照片数据过大')
  const result = addPhotoRelayShot(req.params.sessionId, photo)
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, { seq: result.seq })
})
