import fs from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

import { getDataDir, getMediaDir } from '../config/env'
import { normalizeCertNo } from '../domain/inventory.rules'
import { prisma } from './prisma'

const BACKFILL_LEDGER = () => path.join(getDataDir(), 'watermark-backfill-v1.json')

export interface PhotoWatermarkSettings {
  enabled: boolean
  /** 在自动字号基础上增加的像素，默认 16（约大 4 号） */
  fontSizeBoost: number
}

export const DEFAULT_PHOTO_WATERMARK: PhotoWatermarkSettings = {
  enabled: true,
  fontSizeBoost: 16,
}

export function formatWatermarkTime(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 左上角彩色水印 SVG：渐变字 + 半透明底，深浅底图均可读 */
export function buildWatermarkSvg(
  imageWidth: number,
  imageHeight: number,
  certNo: string,
  timeStr: string,
  wm: PhotoWatermarkSettings = DEFAULT_PHOTO_WATERMARK,
): Buffer {
  const w = Math.max(1, imageWidth)
  const h = Math.max(1, imageHeight)
  const scale = Math.max(0.55, Math.min(1.35, w / 1200))
  const boost = wm.fontSizeBoost ?? DEFAULT_PHOTO_WATERMARK.fontSizeBoost
  const fontMain = Math.round(Math.max(22, Math.min(52, w * 0.042)) * scale) + boost
  const fontSub = Math.round(fontMain * 0.82)
  const pad = Math.round(Math.max(10, w * 0.018))
  const lineGap = Math.round(fontSub * 0.35)
  const boxW = Math.min(w - pad * 2, Math.round(w * 0.78))
  const boxH = pad * 2 + fontMain + lineGap + fontSub
  const cert = escapeXml(normalizeCertNo(certNo))
  const time = escapeXml(timeStr)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wmGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="45%" stop-color="#c084fc"/>
      <stop offset="100%" stop-color="#fbbf24"/>
    </linearGradient>
  </defs>
  <rect x="${pad - 6}" y="${pad - 6}" width="${boxW + 12}" height="${boxH + 12}" rx="10" ry="10"
    fill="rgba(0,0,0,0.52)" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
  <text x="${pad + 4}" y="${pad + fontMain}" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    font-size="${fontMain}" font-weight="400" fill="#ffffff">${cert}</text>
  <text x="${pad + 4}" y="${pad + fontMain + lineGap + fontSub}" font-family="Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    font-size="${fontSub}" font-weight="400" fill="url(#wmGrad)">${time}</text>
</svg>`

  return Buffer.from(svg)
}

/** 上传时仅校正 EXIF 方向；无旋转需求时原样保存，不重新压缩 */
export async function optimizePhotoForStorage(
  input: Buffer,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const meta = await sharp(input).metadata()
  const fmt = meta.format
  const needsRotate = meta.orientation != null && meta.orientation !== 1

  if (!needsRotate) {
    if (fmt === 'jpeg' || fmt === 'jpg') {
      return { buffer: input, mimeType: 'image/jpeg' }
    }
    if (fmt === 'png') {
      return { buffer: input, mimeType: 'image/png' }
    }
    if (fmt === 'webp') {
      return { buffer: input, mimeType: 'image/webp' }
    }
  }

  const image = sharp(input).rotate()
  if (fmt === 'png') {
    const buffer = await image.png({ compressionLevel: 3 }).toBuffer()
    return { buffer, mimeType: 'image/png' }
  }
  if (fmt === 'webp') {
    const buffer = await image.webp({ quality: 100 }).toBuffer()
    return { buffer, mimeType: 'image/webp' }
  }

  const buffer = await image.jpeg({ quality: 100, mozjpeg: true }).toBuffer()
  return { buffer, mimeType: 'image/jpeg' }
}

export async function applyPhotoWatermark(
  input: Buffer,
  certNo: string,
  capturedAt?: Date,
  wm: PhotoWatermarkSettings = DEFAULT_PHOTO_WATERMARK,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const timeStr = formatWatermarkTime(capturedAt ?? new Date())
  const meta = await sharp(input).metadata()
  const width = meta.width || 800
  const height = meta.height || 600
  const overlay = buildWatermarkSvg(width, height, certNo, timeStr, wm)

  let pipeline = sharp(input).composite([{ input: overlay, top: 0, left: 0 }])
  const fmt = meta.format

  if (fmt === 'png') {
    const buffer = await pipeline.png({ compressionLevel: 6 }).toBuffer()
    return { buffer, mimeType: 'image/png' }
  }
  if (fmt === 'webp') {
    const buffer = await pipeline.webp({ quality: 92 }).toBuffer()
    return { buffer, mimeType: 'image/webp' }
  }
  if (fmt === 'gif') {
    const buffer = await pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer()
    return { buffer, mimeType: 'image/jpeg' }
  }

  const buffer = await pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer()
  return { buffer, mimeType: 'image/jpeg' }
}

export function resolveMediaAbsPath(relPath: string): string {
  return path.join(getMediaDir(), '..', relPath.replace(/\\/g, '/'))
}

export async function writePhotoThumbnail(originalBuffer: Buffer, thumbDestAbs: string): Promise<void> {
  await sharp(originalBuffer)
    .rotate()
    .resize(480, 480, { fit: 'inside' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(thumbDestAbs)
}

function loadBackfillLedger(): Set<string> {
  const file = BACKFILL_LEDGER()
  if (!fs.existsSync(file)) return new Set()
  try {
    const ids = JSON.parse(fs.readFileSync(file, 'utf8')) as string[]
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function saveBackfillLedger(ids: Set<string>): void {
  fs.writeFileSync(BACKFILL_LEDGER(), JSON.stringify([...ids], null, 0), 'utf8')
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

async function watermarkFileOnDisk(
  absPath: string,
  certNo: string,
  capturedAt: Date,
  ledgerKey: string,
  doneIds: Set<string>,
): Promise<'done' | 'failed'> {
  try {
    const raw = fs.readFileSync(absPath)
    const { buffer, mimeType } = await applyPhotoWatermark(raw, certNo, capturedAt)
    fs.writeFileSync(absPath, buffer)

    const dir = path.dirname(absPath)
    const base = path.basename(absPath)
    const ext = path.extname(base)
    const thumbName = `thumb-${base.replace(ext, '.jpg')}`
    const thumbAbs = path.join(dir, thumbName)
    if (fs.existsSync(thumbAbs)) {
      await writePhotoThumbnail(buffer, thumbAbs)
    }

    const rel = path.relative(path.join(getMediaDir(), '..'), absPath).replace(/\\/g, '/')
    const asset = await prisma.mediaAsset.findFirst({ where: { path: rel } })
    if (asset) {
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { sizeBytes: buffer.length, mimeType, watermarkBaked: true },
      })
      doneIds.add(asset.id)
    }
    doneIds.add(ledgerKey)
    doneIds.add(`path:${rel}`)
    saveBackfillLedger(doneIds)
    return 'done'
  } catch (err) {
    console.warn('[watermark] 补打失败 %s: %s', absPath, err instanceof Error ? err.message : err)
    return 'failed'
  }
}

/** 手动脚本用：历史照片一次性烧录（日常展示已改为动态叠加，启动时不再自动执行） */
export async function backfillPhotoWatermarks(): Promise<{ done: number; skipped: number; failed: number }> {
  const doneIds = loadBackfillLedger()
  let done = 0
  let skipped = 0
  let failed = 0

  const assets = await prisma.mediaAsset.findMany({
    where: { type: 'photo' },
    include: { bracelet: { select: { certNo: true } } },
    orderBy: { createdAt: 'asc' },
  })

  for (const asset of assets) {
    if (doneIds.has(asset.id) || asset.watermarkBaked) {
      skipped += 1
      continue
    }
    const certNo = asset.bracelet?.certNo || path.basename(path.dirname(asset.path))
    const absPath = resolveMediaAbsPath(asset.path)
    if (!fs.existsSync(absPath)) {
      failed += 1
      continue
    }

    const result = await watermarkFileOnDisk(absPath, certNo, asset.createdAt, asset.id, doneIds)
    if (result === 'done') done += 1
    else failed += 1
  }

  const mediaRoot = getMediaDir()
  if (fs.existsSync(mediaRoot)) {
    for (const certDir of fs.readdirSync(mediaRoot)) {
      const certPath = path.join(mediaRoot, certDir)
      if (!fs.statSync(certPath).isDirectory()) continue
      const certNo = normalizeCertNo(certDir)
      for (const name of fs.readdirSync(certPath)) {
        if (name.startsWith('thumb-')) continue
        const ext = path.extname(name).toLowerCase()
        if (!IMAGE_EXT.has(ext)) continue
        const absPath = path.join(certPath, name)
        const rel = path.relative(path.join(mediaRoot, '..'), absPath).replace(/\\/g, '/')
        const ledgerKey = `path:${rel}`
        if (doneIds.has(ledgerKey)) {
          skipped += 1
          continue
        }
        const stat = fs.statSync(absPath)
        const result = await watermarkFileOnDisk(absPath, certNo, stat.mtime, ledgerKey, doneIds)
        if (result === 'done') done += 1
        else failed += 1
      }
    }
  }

  return { done, skipped, failed }
}
