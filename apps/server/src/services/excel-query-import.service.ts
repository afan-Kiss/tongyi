/**
 * 查询模式：系统无记录时从 Excel 编号索引 / 实时 Excel 补登记（不改 Excel）。
 */
import type { ExcelRowData } from '../adapters/excel/excel-live.adapter'
import { fetchExcelRowData } from '../adapters/excel/excel-live.adapter'
import { normalizeCertNo } from '../domain/inventory.rules'
import { braceletRepo } from '../repositories/bracelet.repository'
import {
  certIndexEntryToRowData,
  findCertIndexEntry,
  getCertIndexStatus,
  refreshCertIndex,
  searchCertIndex,
} from './excel-cert-index.service'
import { executeRegisterBracelet } from './operation.service'
import { healBraceletAttachments } from './bracelet-meta-restore.service'
import { presentBracelet } from '../utils/media-presenter'

function normalizeScanInput(raw: string): string {
  return raw.replace(/[\r\n\0]+/g, '').trim()
}

function rowFromIndex(scanned: string): { row: ExcelRowData; fromCache: true } | null {
  const code = normalizeScanInput(scanned)
  if (!code) return null

  const norm = normalizeCertNo(code)
  const exact = findCertIndexEntry(norm)
  if (exact) return { row: certIndexEntryToRowData(exact), fromCache: true }

  const hits = searchCertIndex(code, 8)
  if (!hits.length) return null

  const exactHit = hits.find((h) => h.certNo === norm)
  if (exactHit) return { row: certIndexEntryToRowData(exactHit), fromCache: true }

  if (hits.length === 1) return { row: certIndexEntryToRowData(hits[0]), fromCache: true }

  return null
}

async function rowFromExcelLive(certNo: string): Promise<ExcelRowData | null> {
  const excel = await fetchExcelRowData(normalizeCertNo(certNo))
  if (!excel.ok || !excel.data) return null
  return excel.data
}

async function resolveExcelRow(scanned: string): Promise<{ row: ExcelRowData; fromCache: boolean } | null> {
  const cached = rowFromIndex(scanned)
  if (cached) return cached

  const status = getCertIndexStatus()
  if (!status.ready && !status.loading) {
    await refreshCertIndex()
    const retry = rowFromIndex(scanned)
    if (retry) return retry
  }

  const norm = normalizeCertNo(normalizeScanInput(scanned))
  const live = await rowFromExcelLive(norm)
  if (live) return { row: live, fromCache: false }

  return null
}

function hasPhotoAssets(bracelet: { mediaAssets?: { type: string }[] }): boolean {
  return (bracelet.mediaAssets || []).some((m) => m.type === 'photo')
}

export type ExcelQueryImportResult = {
  certNo: string
  bracelet: ReturnType<typeof presentBracelet>
  fromCache: boolean
  needsPhoto: boolean
  imported: boolean
}

/** 系统无记录时，从 Excel 缓存/实时读取并登记到数据库 */
export async function importBraceletFromExcelOnQuery(
  scanned: string,
): Promise<ExcelQueryImportResult | null> {
  const code = normalizeScanInput(scanned)
  if (!code) return null

  const resolved = await resolveExcelRow(code)
  if (!resolved) return null

  const certNo = normalizeCertNo(resolved.row.certNo)
  let existing = await braceletRepo.findByCert(certNo)
  if (existing) {
    await healBraceletAttachments(certNo)
    existing = await braceletRepo.findByCert(certNo)
    if (!existing) return null
    const presented = presentBracelet(existing)
    return {
      certNo,
      bracelet: presented,
      fromCache: resolved.fromCache,
      needsPhoto: !hasPhotoAssets(presented),
      imported: false,
    }
  }

  const reg = await executeRegisterBracelet({ certNo })
  if (!reg.ok) return null

  const scanCompact = code.replace(/\s+/g, '')
  const certCompact = certNo.replace(/\s+/g, '')
  if (scanCompact && scanCompact.toUpperCase() !== certCompact.toUpperCase()) {
    const fresh = await braceletRepo.findByCert(certNo)
    if (fresh && !fresh.barcodeValue) {
      await braceletRepo.update(fresh.id, { barcodeValue: code })
    }
  }

  await healBraceletAttachments(certNo)
  const full = await braceletRepo.findByCert(certNo)
  if (!full) return null

  const presented = presentBracelet(full)
  return {
    certNo,
    bracelet: presented,
    fromCache: resolved.fromCache,
    needsPhoto: !hasPhotoAssets(presented),
    imported: true,
  }
}
