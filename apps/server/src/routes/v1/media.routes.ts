import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import fs from 'node:fs'
import { getDataDir } from '../../config/env'
import { queryByCertNo } from '../../services/inventory-query.service'
import { saveMediaFile, mediaPublicUrl } from '../../adapters/media/media-store.adapter'
import { deleteMediaAsset } from '../../services/media-command.service'
import { normalizeCertNo } from '../../domain/inventory.rules'
import { sendErr, sendOk } from '../../utils/api-response'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

export const mediaV1Router = Router()

mediaV1Router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return sendErr(res, '未收到文件')
  const certNo = normalizeCertNo(String(req.body.certNo || ''))
  if (!certNo) return sendErr(res, '请提供编号 certNo')
  const bracelet = await queryByCertNo(certNo)
  if (!bracelet) return sendErr(res, `编号 ${certNo} 不存在`, 404)
  const type = req.file.mimetype.startsWith('video/') ? 'video' : 'photo'
  const asset = await saveMediaFile(bracelet.id, certNo, req.file, type)
  sendOk(res, {
    ...asset,
    url: mediaPublicUrl(asset.path),
    thumbUrl: asset.thumbPath ? mediaPublicUrl(asset.thumbPath) : null,
  })
})

mediaV1Router.delete('/:assetId', async (req, res) => {
  const deleted = await deleteMediaAsset(req.params.assetId)
  if (!deleted) return sendErr(res, '媒体文件不存在', 404)
  sendOk(res, { id: deleted.id })
})

mediaV1Router.get('/file/*', (req, res) => {
  const rel = (req.params as { 0?: string })[0]
  if (!rel) return sendErr(res, '缺少文件路径', 400)
  const full = path.join(getDataDir(), rel)
  if (!fs.existsSync(full)) return sendErr(res, '文件不存在', 404)
  res.sendFile(full)
})
