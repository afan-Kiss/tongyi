import path from 'node:path'
import fs from 'node:fs'

import type { Bracelet, MediaAsset } from '@prisma/client'

import { getDataDir } from '../config/env'
import {
  certMatchesContainsSearchQuery,
  certMatchesSearchQuery,
} from '../domain/cert-no.rules'
import { braceletRepo } from '../repositories/bracelet.repository'
import { prisma } from '../lib/prisma'
import type { ScannerBraceletDto, ScannerBraceletStatus } from './types'

type BraceletWithMedia = Bracelet & { mediaAssets: MediaAsset[] }

function toApiPath(abs: string): string {
  return abs.replace(/\\/g, '/')
}

function formatDateTime(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const dt = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dt.getTime())) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
}

function parseInboundCost(cost: string | null | undefined): number | null {
  const s = (cost || '').trim()
  if (!s) return null
  const n = Number(s.replace(/,/g, '').replace(/[^\d.-]/g, ''))
  return Number.isNaN(n) ? null : n
}

function resolveStatus(qty: number): ScannerBraceletStatus {
  return qty >= 1 ? 'in_stock' : 'out_of_stock'
}

function resolveAbsoluteFromRel(rel: string | null | undefined): string | null {
  if (!rel?.trim()) return null
  const abs = path.join(getDataDir(), rel.replace(/\\/g, '/'))
  return fs.existsSync(abs) ? toApiPath(abs) : null
}

function pickPrimaryPhoto(assets: MediaAsset[]): MediaAsset | null {
  const photos = assets.filter((a) => a.type === 'photo')
  if (photos.length) return photos[0]
  return assets[0] || null
}

function resolveInboundAt(row: Bracelet): string | null {
  return formatDateTime(row.createdAt) || formatDateTime(row.arrivalDate)
}

function toScannerBracelet(row: BraceletWithMedia): ScannerBraceletDto {
  const braceletCode = row.certNo
  const photo = pickPrimaryPhoto(row.mediaAssets)
  const imagePath = photo ? resolveAbsoluteFromRel(photo.path) : null
  const thumbPath = photo?.thumbPath ? resolveAbsoluteFromRel(photo.thumbPath) : null

  return {
    scannerProductId: row.id,
    braceletCode,
    barcodeValue: (row.barcodeValue || '').trim() || braceletCode,
    certificateNo: braceletCode,
    imagePath,
    thumbPath,
    inboundAt: resolveInboundAt(row),
    inboundCost: parseInboundCost(row.cost),
    status: resolveStatus(row.qty),
    raw: {
      id: row.id,
      certNo: row.certNo,
      barcodeValue: row.barcodeValue,
      arrivalDate: row.arrivalDate,
      batch: row.batch,
      qty: row.qty,
      category: row.category,
      ringSize: row.ringSize,
      cost: row.cost,
      remark: row.remark,
      orderNo: row.orderNo,
      soldDate: row.soldDate,
      actualPrice: row.actualPrice,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      mediaAssets: row.mediaAssets.map((a) => ({
        id: a.id,
        type: a.type,
        path: a.path,
        thumbPath: a.thumbPath,
        createdAt: a.createdAt,
      })),
    },
  }
}

function matchRank(row: BraceletWithMedia, query: string): number | null {
  const q = query.trim()
  if (!q) return null
  const cert = row.certNo.trim()
  const bar = (row.barcodeValue || '').trim()
  const qu = q.toUpperCase()
  const certU = cert.toUpperCase()
  const barU = bar.toUpperCase()

  if (certU === qu || barU === qu) return 0
  if (certMatchesSearchQuery(cert, q) || (bar && barU.startsWith(qu))) return 1
  if (certMatchesContainsSearchQuery(cert, q) || (bar && barU.includes(qu))) return 2
  if (bar && certMatchesContainsSearchQuery(bar, q)) return 2
  return null
}

/** 按镯子编号查询（大小写不敏感），返回原始编号 */
export async function getBraceletByCode(code: string): Promise<ScannerBraceletDto | null> {
  const trimmed = code.trim()
  if (!trimmed) return null

  const row = await braceletRepo.findByScanCode(trimmed)
  if (row) return toScannerBracelet(row as BraceletWithMedia)

  const upper = trimmed.toUpperCase()
  const lower = trimmed.toLowerCase()
  const fallback = await prisma.bracelet.findFirst({
    where: {
      OR: [{ certNo: trimmed }, { certNo: upper }, { certNo: lower }, { barcodeValue: trimmed }],
    },
    include: { mediaAssets: { orderBy: { createdAt: 'desc' } } },
  })
  if (!fallback) return null
  return toScannerBracelet(fallback as BraceletWithMedia)
}

/** 模糊搜索，最多 20 条，按匹配程度 + 最近入库排序 */
export async function searchBracelets(query: string, limit = 20): Promise<ScannerBraceletDto[]> {
  const q = query.trim()
  if (!q) return []

  const qUpper = q.toUpperCase()
  const candidates = await prisma.bracelet.findMany({
    where: {
      OR: [
        { certNo: { contains: qUpper } },
        { certNo: { contains: q } },
        { barcodeValue: { contains: q } },
        { barcodeValue: { contains: qUpper } },
      ],
    },
    include: { mediaAssets: { orderBy: { createdAt: 'desc' } } },
    take: 300,
    orderBy: { createdAt: 'desc' },
  })

  const ranked = (candidates as BraceletWithMedia[])
    .map((row) => ({ row, rank: matchRank(row, q) }))
    .filter((item): item is { row: BraceletWithMedia; rank: number } => item.rank !== null)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank
      const ta = a.row.createdAt?.getTime?.() ?? 0
      const tb = b.row.createdAt?.getTime?.() ?? 0
      return tb - ta
    })
    .slice(0, limit)
    .map(({ row }) => toScannerBracelet(row))

  return ranked
}

export function getBraceletPrimaryImageAbs(row: ScannerBraceletDto): string | null {
  const p = row.imagePath
  if (!p) return null
  return fs.existsSync(p) ? p : null
}

export function getBraceletThumbAbs(row: ScannerBraceletDto): string | null {
  const p = row.thumbPath
  if (p && fs.existsSync(p)) return p
  return null
}
