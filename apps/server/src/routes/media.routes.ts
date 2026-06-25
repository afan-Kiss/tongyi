import { Router } from 'express'
import multer from 'multer'
import { findByCertNo } from '../services/bracelet.service'
import { saveMediaFile, mediaPublicUrl } from '../services/media.service'
import { sendMediaFile } from '../services/media-serve.service'
import { normalizeCertNo } from '../services/inventory.service'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
})

export const mediaRouter = Router()

mediaRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, message: '未收到文件' })
    return
  }
  const certNo = normalizeCertNo(String(req.body.certNo || ''))
  if (!certNo) {
    res.status(400).json({ ok: false, message: '请提供编号 certNo' })
    return
  }
  const bracelet = await findByCertNo(certNo)
  if (!bracelet) {
    res.status(404).json({ ok: false, message: `编号 ${certNo} 不存在` })
    return
  }
  const type = req.file.mimetype.startsWith('video/') ? 'video' : 'photo'
  const asset = await saveMediaFile(bracelet.id, certNo, req.file, type)
  res.json({
    ok: true,
    data: {
      ...asset,
      url: mediaPublicUrl(asset.path),
      thumbUrl: asset.thumbPath ? mediaPublicUrl(asset.thumbPath) : null,
    },
  })
})

mediaRouter.get('/file/*', async (req, res) => {
  const rel = (req.params as { 0?: string })[0]
  if (!rel) {
    res.status(400).json({ ok: false, message: '缺少文件路径' })
    return
  }
  const ok = await sendMediaFile(rel, res, { raw: String(req.query.raw || '') })
  if (!ok) {
    res.status(404).json({ ok: false, message: '文件不存在' })
  }
})
