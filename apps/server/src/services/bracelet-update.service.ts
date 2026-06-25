import { normalizeCertNo } from '../domain/inventory.rules'
import type { BraceletDetailInput } from '../repositories/detail.repository'
import { braceletRepo } from '../repositories/bracelet.repository'
import { detailRepo } from '../repositories/detail.repository'
import { queryByCertNo } from './inventory-query.service'
import { ensureDetailRecord } from './detail.service'
import type { ExcelSyncResult } from '../types/api.types'

/** 编辑库存详情时返回：Excel 仅允许出入库流程修改 */
export const EXCEL_EDIT_SKIPPED_MSG = '已保存到数据库（未修改 Excel；变更 Excel 请做出库/入库）'

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

  const presented = await queryByCertNo(code)
  const excelSync: ExcelSyncResult = { ok: true, message: EXCEL_EDIT_SKIPPED_MSG }
  return {
    ok: true as const,
    bracelet: presented,
    excelSync,
    partialSuccess: false,
  }
}
