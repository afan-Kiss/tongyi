import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { getMediaDir } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { normalizeCertNo } from '../../domain/inventory.rules'

export async function saveMediaFile(
  braceletId: string,
  certNo: string,
  file: Express.Multer.File,
  type: 'photo' | 'video',
) {
  const safeCert = normalizeCertNo(certNo)
  const dir = path.join(getMediaDir(), safeCert)
  fs.mkdirSync(dir, { recursive: true })
  const ext = path.extname(file.originalname) || (type === 'photo' ? '.jpg' : '.webm')
  const filename = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`
  const destPath = path.join(dir, filename)
  fs.writeFileSync(destPath, file.buffer)

  let thumbPath: string | null = null
  if (type === 'photo') {
    const thumbName = `thumb-${filename.replace(ext, '.jpg')}`
    const thumbDest = path.join(dir, thumbName)
    await sharp(file.buffer).resize(320, 320, { fit: 'inside' }).jpeg({ quality: 82 }).toFile(thumbDest)
    thumbPath = path.relative(path.join(getMediaDir(), '..'), thumbDest).replace(/\\/g, '/')
  }

  const relPath = path.relative(path.join(getMediaDir(), '..'), destPath).replace(/\\/g, '/')
  return prisma.mediaAsset.create({
    data: { braceletId, type, filename, path: relPath, thumbPath, mimeType: file.mimetype, sizeBytes: file.size },
  })
}

export function mediaPublicUrl(assetPath: string): string {
  const encoded = assetPath.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  return `/api/v1/media/file/${encoded}`
}
