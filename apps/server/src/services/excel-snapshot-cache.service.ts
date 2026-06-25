import fs from 'node:fs'
import path from 'node:path'

import { getDataDir } from '../config/env'
import { normalizeCertNo } from '../domain/inventory.rules'

export interface CachedExcelSnapshot {
  certNo: string
  base64: string
  capturedAt: string
  row?: number
  sheet?: string
  message?: string
}

function cacheDir(): string {
  const dir = path.join(getDataDir(), 'excel-snapshots')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeCertFileName(certNo: string): string {
  return normalizeCertNo(certNo).replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown'
}

function metaPath(certNo: string): string {
  return path.join(cacheDir(), `${safeCertFileName(certNo)}.meta.json`)
}

function pngPath(certNo: string): string {
  return path.join(cacheDir(), `${safeCertFileName(certNo)}.png`)
}

function stripDataUrlPrefix(b64: string): string {
  const s = b64.trim()
  const idx = s.indexOf('base64,')
  return idx >= 0 ? s.slice(idx + 7) : s
}

export function loadCurrentSnapshotCache(certNo: string): CachedExcelSnapshot | null {
  const code = normalizeCertNo(certNo)
  const png = pngPath(code)
  const metaFile = metaPath(code)
  if (!fs.existsSync(png) || !fs.existsSync(metaFile)) return null
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as {
      certNo?: string
      capturedAt?: string
      row?: number
      sheet?: string
      message?: string
    }
    const buf = fs.readFileSync(png)
    if (!buf.length) return null
    return {
      certNo: meta.certNo || code,
      base64: buf.toString('base64'),
      capturedAt: meta.capturedAt || new Date(fs.statSync(png).mtimeMs).toISOString(),
      row: meta.row,
      sheet: meta.sheet,
      message: meta.message,
    }
  } catch {
    return null
  }
}

export async function saveCurrentSnapshotCache(
  certNo: string,
  input: {
    base64: string
    capturedAt?: string
    row?: number
    sheet?: string
    message?: string
  },
): Promise<void> {
  const code = normalizeCertNo(certNo)
  const raw = stripDataUrlPrefix(input.base64)
  if (!raw) return
  const buf = Buffer.from(raw, 'base64')
  if (!buf.length) return

  const capturedAt = input.capturedAt || new Date().toISOString()
  fs.writeFileSync(pngPath(code), buf)
  fs.writeFileSync(
    metaPath(code),
    JSON.stringify(
      {
        certNo: code,
        capturedAt,
        row: input.row,
        sheet: input.sheet,
        message: input.message,
      },
      null,
      0,
    ),
  )
}

export function persistCurrentSnapshotFromSync(
  certNo: string,
  sync: { afterSnapshotBase64?: string; snapshotBase64?: string; row?: number; sheet?: string; syncedAt?: string },
): void {
  const b64 = sync.afterSnapshotBase64 ?? sync.snapshotBase64
  if (!b64) return
  void saveCurrentSnapshotCache(certNo, {
    base64: b64,
    row: sync.row,
    sheet: sync.sheet,
    capturedAt: sync.syncedAt,
    message: '出入库同步后自动保存',
  }).catch(() => {})
}
