import fs from 'node:fs'
import path from 'node:path'

import { getMediaDir } from '../config/env'
import { normalizeCertNo } from '../domain/inventory.rules'
import { prisma } from '../lib/prisma'
import { braceletRepo } from '../repositories/bracelet.repository'

const META_OP_TYPES = ['register', 'new_inbound', 'outbound', 'inbound'] as const

function parseJsonRecord(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw) as unknown
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 从过往操作日志恢复 barcode / labelPrice（Excel 补建或记录缺失时） */
export async function restoreBraceletSqlMetadata(braceletId: string, certNo: string): Promise<boolean> {
  const code = normalizeCertNo(certNo)
  const current = await braceletRepo.findByCert(code)
  if (!current || current.id !== braceletId) return false

  const needsBarcode = !current.barcodeValue?.trim()
  const needsLabelPrice = !current.labelPrice?.trim()
  if (!needsBarcode && !needsLabelPrice) return false

  const logs = await prisma.operationLog.findMany({
    where: {
      certNo: code,
      reverted: false,
      opType: { in: [...META_OP_TYPES] },
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  const patch: Record<string, string> = {}
  for (const log of logs) {
    for (const raw of [log.resultJson, log.snapshotJson]) {
      if (!raw) continue
      const row = parseJsonRecord(raw)
      if (!row) continue
      if (needsBarcode && !patch.barcodeValue) {
        const bc = typeof row.barcodeValue === 'string' ? row.barcodeValue.trim() : ''
        if (bc) patch.barcodeValue = bc
      }
      if (needsLabelPrice && !patch.labelPrice) {
        const lp = typeof row.labelPrice === 'string' ? row.labelPrice.trim() : ''
        if (lp) patch.labelPrice = lp
      }
      if (patch.barcodeValue && patch.labelPrice) break
    }
    if (patch.barcodeValue && patch.labelPrice) break
  }

  if (!Object.keys(patch).length) return false
  await braceletRepo.update(braceletId, patch)
  return true
}

function guessMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mp4') return 'video/mp4'
  return 'image/jpeg'
}

function guessType(mime: string): 'photo' | 'video' {
  return mime.startsWith('video/') ? 'video' : 'photo'
}

/** 将磁盘上已有文件补登记为 MediaAsset（避免 DB 记录重建后照片“消失”） */
export async function syncMediaAssetsFromDisk(braceletId: string, certNo: string): Promise<number> {
  const code = normalizeCertNo(certNo)
  const dir = path.join(getMediaDir(), code)
  if (!fs.existsSync(dir)) return 0

  const existing = await prisma.mediaAsset.findMany({
    where: { braceletId },
    select: { filename: true, path: true },
  })
  const knownNames = new Set(existing.map((a) => a.filename))
  const knownPaths = new Set(existing.map((a) => a.path.replace(/\\/g, '/')))

  let added = 0
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('thumb-')) continue
    const full = path.join(dir, name)
    if (!fs.statSync(full).isFile()) continue

    const relPath = path.relative(path.join(getMediaDir(), '..'), full).replace(/\\/g, '/')
    if (knownNames.has(name) || knownPaths.has(relPath)) continue

    const mime = guessMime(name)
    const type = guessType(mime)
    const thumbName = `thumb-${name.replace(path.extname(name), '.jpg')}`
    const thumbFull = path.join(dir, thumbName)
    const thumbPath = fs.existsSync(thumbFull)
      ? path.relative(path.join(getMediaDir(), '..'), thumbFull).replace(/\\/g, '/')
      : null

    await prisma.mediaAsset.create({
      data: {
        braceletId,
        type,
        filename: name,
        path: relPath,
        thumbPath,
        mimeType: mime,
        sizeBytes: fs.statSync(full).size,
      },
    })
    added += 1
  }
  return added
}

export async function healBraceletAttachments(certNo: string): Promise<void> {
  const code = normalizeCertNo(certNo)
  const bracelet = await braceletRepo.findByCert(code)
  if (!bracelet) return
  await restoreBraceletSqlMetadata(bracelet.id, code)
  await syncMediaAssetsFromDisk(bracelet.id, code)
}
