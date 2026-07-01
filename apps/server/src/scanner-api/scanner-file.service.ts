import path from 'node:path'
import fs from 'node:fs'

import sharp from 'sharp'

import { getDataDir, getMediaDir } from '../config/env'
import { getBraceletByCode } from './scanner-bracelet.service'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const THUMB_WIDTH = 300

function toApiPath(abs: string): string {
  return abs.replace(/\\/g, '/')
}

function allowedRoots(): string[] {
  const data = path.resolve(getDataDir())
  const media = path.resolve(getMediaDir())
  const thumbs = path.resolve(getMediaDir(), 'thumbs')
  return [data, media, thumbs]
}

/** 校验路径是否在允许目录内（不检查文件是否存在） */
export function isPathWithinAllowedRoots(inputPath: string): boolean {
  const raw = (inputPath || '').trim()
  if (!raw) return false
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return false
  }
  const normalized = path.isAbsolute(decoded)
    ? path.resolve(decoded)
    : path.resolve(getDataDir(), decoded.replace(/\\/g, '/'))
  return allowedRoots().some((root) => normalized === root || normalized.startsWith(`${root}${path.sep}`))
}

/** 校验并解析允许读取的图片绝对路径，防止路径穿越 */
export function resolveAllowedImagePath(inputPath: string): string | null {
  const raw = (inputPath || '').trim()
  if (!raw) return null

  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return null
  }

  if (!isPathWithinAllowedRoots(decoded)) return null

  const normalized = path.isAbsolute(decoded)
    ? path.resolve(decoded)
    : path.resolve(getDataDir(), decoded.replace(/\\/g, '/'))
  const ext = path.extname(normalized).toLowerCase()
  if (!IMAGE_EXT.has(ext)) return null
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) return null
  return normalized
}

export function contentTypeForImage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.jpeg':
    case '.jpg':
    default:
      return 'image/jpeg'
  }
}

function scannerThumbPathForCode(code: string): string {
  const safe = code.trim().replace(/[^\w.-]+/g, '_')
  const dir = path.join(getMediaDir(), 'thumbs')
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${safe}.jpg`)
}

async function generateThumbFromOriginal(originalAbs: string, destAbs: string): Promise<void> {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true })
  await sharp(originalAbs)
    .rotate()
    .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(destAbs)
}

/** 获取或生成镯子缩略图（约 300px 宽） */
export async function ensureBraceletThumbAbs(code: string): Promise<string | null> {
  const row = await getBraceletByCode(code)
  if (!row) return null

  const existingThumb = row.thumbPath
  if (existingThumb && fs.existsSync(existingThumb)) return existingThumb

  const dest = scannerThumbPathForCode(row.braceletCode)
  if (fs.existsSync(dest)) return dest

  const original = row.imagePath
  if (!original || !fs.existsSync(original)) return null

  await generateThumbFromOriginal(original, dest)
  return dest
}

export function resolveImageServePath(filePath: string, size?: string): string | null {
  const abs = resolveAllowedImagePath(filePath)
  if (!abs) return null

  if (size !== 'thumb') return abs

  const dir = path.dirname(abs)
  const base = path.basename(abs)
  const ext = path.extname(base)
  const thumbName = `thumb-${base.replace(ext, '.jpg')}`
  const siblingThumb = path.join(dir, thumbName)
  if (fs.existsSync(siblingThumb)) return siblingThumb

  const scannerThumb = path.join(getMediaDir(), 'thumbs', `${path.basename(abs, ext)}.jpg`)
  if (fs.existsSync(scannerThumb)) return scannerThumb

  return abs
}
