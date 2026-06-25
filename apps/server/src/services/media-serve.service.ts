import path from 'node:path'
import fs from 'node:fs'
import type { Response } from 'express'

import { getDataDir } from '../config/env'
import { normalizeCertNo } from '../domain/inventory.rules'
import { applyPhotoWatermark } from '../lib/photo-watermark'
import { prisma } from '../lib/prisma'
import { getSettings } from './settings.service'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

function resolveMediaFilePath(rel: string): string | null {
  const normalized = rel.replace(/\\/g, '/')
  const direct = path.join(getDataDir(), normalized)
  if (fs.existsSync(direct)) return direct
  return null
}

async function resolveMediaFilePathWithFallback(rel: string): Promise<string | null> {
  const direct = resolveMediaFilePath(rel)
  if (direct) return direct

  const normalized = rel.replace(/\\/g, '/')
  const asset = await prisma.mediaAsset.findFirst({
    where: { OR: [{ path: normalized }, { thumbPath: normalized }] },
    select: { path: true, thumbPath: true },
  })
  if (!asset) return null

  if (asset.thumbPath === normalized && asset.path !== normalized) {
    return resolveMediaFilePath(asset.path)
  }
  if (asset.path === normalized && asset.thumbPath) {
    return resolveMediaFilePath(asset.thumbPath)
  }
  return null
}

async function resolvePhotoMeta(
  rel: string,
  fullPath: string,
): Promise<{ certNo: string; capturedAt: Date; watermarkBaked: boolean } | null> {
  const normalized = rel.replace(/\\/g, '/')
  const asset = await prisma.mediaAsset.findFirst({
    where: { OR: [{ path: normalized }, { thumbPath: normalized }] },
    include: { bracelet: { select: { certNo: true } } },
  })
  if (asset?.bracelet?.certNo) {
    return {
      certNo: asset.bracelet.certNo,
      capturedAt: asset.createdAt,
      watermarkBaked: asset.watermarkBaked,
    }
  }

  const parts = normalized.split('/')
  const mediaIdx = parts.indexOf('media')
  if (mediaIdx >= 0 && parts[mediaIdx + 1]) {
    const certNo = normalizeCertNo(parts[mediaIdx + 1])
    const stat = fs.statSync(fullPath)
    return { certNo, capturedAt: stat.mtime, watermarkBaked: true }
  }
  return null
}

export async function sendMediaFile(
  rel: string,
  res: Response,
  query: { raw?: string },
): Promise<boolean> {
  const full = await resolveMediaFilePathWithFallback(rel)
  if (!full) {
    return false
  }

  const ext = path.extname(full).toLowerCase()
  const isImage = IMAGE_EXT.has(ext)
  if (!isImage || query.raw === '1') {
    res.sendFile(full)
    return true
  }

  const settings = await getSettings()
  const wm = settings.photoWatermark
  if (!wm?.enabled) {
    res.sendFile(full)
    return true
  }

  const meta = await resolvePhotoMeta(rel.replace(/\\/g, '/'), full)
  if (!meta || meta.watermarkBaked) {
    res.sendFile(full)
    return true
  }

  try {
    const raw = fs.readFileSync(full)
    const { buffer, mimeType } = await applyPhotoWatermark(raw, meta.certNo, meta.capturedAt, wm)
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'no-store')
    res.send(buffer)
  } catch {
    res.sendFile(full)
  }
  return true
}
