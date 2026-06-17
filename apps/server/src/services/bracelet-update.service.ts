import { isExcelBridgeEnabled } from '../config/env'
import { normalizeCertNo } from '../domain/inventory.rules'
import type { BraceletDetailInput } from '../repositories/detail.repository'
import { braceletRepo } from '../repositories/bracelet.repository'
import { detailRepo } from '../repositories/detail.repository'
import { syncUpdateRowToExcel } from '../adapters/excel/excel-live.adapter'
import { queryByCertNo } from './inventory-query.service'
import { ensureDetailRecord } from './detail.service'
import type { ExcelSyncResult } from '../types/api.types'

const READONLY_FIELDS = [
  'certNo', 'qty', 'soldDate', 'actualPrice', 'returnDate', 'orderNo',
  'salesPerson', 'salesChannel', 'excelRow', 'excelSheet', 'id',
] as const

export interface BraceletUpdateInput {
  arrivalDate?: string
  batch?: string
  category?: string
  ringSize?: string
  cost?: string
  remark?: string
  labelPrice?: string
  barcodeValue?: string
  detail?: BraceletDetailInput
}

export async function updateBraceletByCert(certNo: string, input: BraceletUpdateInput) {
  const code = normalizeCertNo(certNo)
  const bracelet = await braceletRepo.findByCert(code)
  if (!bracelet) return { ok: false as const, message: `编号 ${code} 不存在` }

  for (const key of READONLY_FIELDS) {
    if (key in (input as Record<string, unknown>)) {
      return { ok: false as const, message: `字段 ${key} 不可通过编辑修改` }
    }
  }

  const basicData: Record<string, string | null | undefined> = {}
  if (input.arrivalDate !== undefined) basicData.arrivalDate = input.arrivalDate || null
  if (input.batch !== undefined) basicData.batch = input.batch || null
  if (input.category !== undefined) basicData.category = input.category || null
  if (input.ringSize !== undefined) basicData.ringSize = input.ringSize || null
  if (input.cost !== undefined) basicData.cost = input.cost || null
  if (input.remark !== undefined) basicData.remark = input.remark || null
  if (input.labelPrice !== undefined) basicData.labelPrice = input.labelPrice || null
  if (input.barcodeValue !== undefined) basicData.barcodeValue = input.barcodeValue || null

  if (Object.keys(basicData).length > 0) {
    await braceletRepo.update(bracelet.id, basicData)
  }

  if (input.detail) {
    await ensureDetailRecord(bracelet.id)
    await detailRepo.upsert(bracelet.id, input.detail)
  }

  let excelSync: ExcelSyncResult = { ok: true, message: '未同步 Excel（无行号或未启用桥接）' }
  const updated = await braceletRepo.findByCert(code)
  if (!updated) return { ok: false as const, message: '更新后读取失败' }

  if (isExcelBridgeEnabled() && updated.excelRow) {
    excelSync = await syncUpdateRowToExcel({
      certNo: code,
      excelRow: updated.excelRow,
      excelSheet: updated.excelSheet,
      arrivalDate: updated.arrivalDate,
      batch: updated.batch,
      category: updated.category,
      ringSize: updated.ringSize,
      cost: updated.cost,
      remark: updated.remark,
    })
  }

  const presented = await queryByCertNo(code)
  return {
    ok: true as const,
    bracelet: presented,
    excelSync,
    partialSuccess: !excelSync.ok && isExcelBridgeEnabled() && !!updated.excelRow,
  }
}
