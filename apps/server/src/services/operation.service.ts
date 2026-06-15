/**
 * 出入库编排服务 — 校验 → 预检 Excel → DB 事务写 → 同步 Excel（失败可重试）
 */
import { DEFAULT_OUTBOUND_REMARK, isExcelBridgeEnabled } from '../config/env'
import {
  computeInboundRemark,
  computeNewRemark,
  normalizeCertNo,
  parseSalePrice,
  todayStr,
} from '../domain/inventory.rules'
import {
  toExcelInboundPayload,
  toExcelNewInboundPayload,
  toExcelOutboundPayload,
} from '../domain/excel-fields'
import {
  syncInboundToExcel,
  syncNewInboundToExcel,
  syncOutboundToExcel,
  fetchExcelRowSnapshot,
  fetchExcelRowData,
  precheckExcelRow,
  revertExcelRow,
} from '../adapters/excel/excel-live.adapter'
import { braceletRepo, operationLogRepo } from '../repositories/bracelet.repository'
import { detailRepo } from '../repositories/detail.repository'
import { prisma } from '../lib/prisma'
import { ensureDetailRecord } from './detail.service'
import type { ExcelSyncResult, InboundDto, NewBraceletDto, OperationResult, OutboundDto } from '../types/api.types'

type Fail = { ok: false; message: string }
type Ok<T> = { ok: true } & T

const PARTIAL_MSG = '数据库已更新，Excel 未同步，请点击「重试 Excel 同步」'

function wrapOperationResult(
  bracelet: Record<string, unknown>,
  logId: string,
  excelSync?: ExcelSyncResult,
): OperationResult {
  const partial = !!excelSync && !excelSync.ok && isExcelBridgeEnabled()
  return {
    bracelet,
    logId,
    excelSync,
    partialSuccess: partial,
    partialMessage: partial ? PARTIAL_MSG : undefined,
  }
}

async function recordExcelSync(logId: string, excelSync: ExcelSyncResult) {
  await operationLogRepo.updateExcelSync(
    logId,
    excelSync.ok,
    JSON.stringify({
      message: excelSync.message,
      row: excelSync.row,
      sheet: excelSync.sheet,
      hasSnapshot: !!excelSync.snapshotBase64,
    }),
  )
}

export async function executeOutbound(input: OutboundDto): Promise<Ok<OperationResult> | Fail> {
  const certNo = normalizeCertNo(input.certNo)
  const bracelet = await braceletRepo.findByCert(certNo)
  if (!bracelet) return { ok: false, message: `编号 ${certNo} 不存在` }
  if (bracelet.qty === 0) return { ok: false, message: `${certNo} 已出库，请勿重复操作` }

  const { value: priceVal, error: priceErr } = parseSalePrice(input.priceText)
  if (priceErr) return { ok: false, message: priceErr }

  if (isExcelBridgeEnabled()) {
    const pre = await precheckExcelRow(certNo, bracelet.excelRow, bracelet.excelSheet)
    if (!pre.ok) return { ok: false, message: pre.message }
  }

  const today = todayStr()
  const newRemark = computeNewRemark(bracelet.remark, input.remarkText || DEFAULT_OUTBOUND_REMARK)
  const snapshot = { ...bracelet }

  const { updated, log } = await prisma.$transaction(async (tx) => {
    const upd = await tx.bracelet.update({
      where: { id: bracelet.id },
      data: {
        qty: 0,
        soldDate: today,
        actualPrice: String(priceVal),
        salesPerson: input.salesPerson?.trim() || bracelet.salesPerson,
        salesChannel: input.salesChannel?.trim() || bracelet.salesChannel,
        orderNo: input.orderNo?.trim() || bracelet.orderNo,
        remark: newRemark ?? bracelet.remark,
      },
    })
    const lg = await tx.operationLog.create({
      data: {
        braceletId: bracelet.id,
        certNo,
        opType: 'outbound',
        snapshotJson: JSON.stringify(snapshot),
        resultJson: JSON.stringify(upd),
      },
    })
    return { updated: upd, log: lg }
  })

  const excelSync = await syncOutboundToExcel(
    toExcelOutboundPayload(bracelet, {
      price: priceVal!,
      remark: input.remarkText || DEFAULT_OUTBOUND_REMARK,
      fullRemark: newRemark ?? bracelet.remark ?? '',
      salesPerson: input.salesPerson || '',
      salesChannel: input.salesChannel || '',
      orderNo: input.orderNo || '',
    }),
  )
  await recordExcelSync(log.id, excelSync)
  return { ok: true, ...wrapOperationResult(updated, log.id, excelSync) }
}

export async function executeInbound(input: InboundDto): Promise<Ok<OperationResult> | Fail> {
  const certNo = normalizeCertNo(input.certNo)
  let bracelet = await braceletRepo.findByCert(certNo)
  if (!bracelet) {
    const { upsertBraceletFromExcel } = await import('./excel-row-sync.service')
    bracelet = await upsertBraceletFromExcel(certNo)
  }
  if (!bracelet) return { ok: false, message: `编号 ${certNo} 不存在（数据库与 Excel 均未找到，请确认 Excel 已打开且编号在第 4 列）` }
  if (bracelet.qty === 1) return { ok: false, message: `${certNo} 已在库，请勿重复入库` }

  if (isExcelBridgeEnabled()) {
    const pre = await precheckExcelRow(certNo, bracelet.excelRow, bracelet.excelSheet)
    if (!pre.ok) return { ok: false, message: pre.message }
  }

  const today = todayStr()
  const newRemark = computeInboundRemark(bracelet.remark, input.remarkText, today)
  const snapshot = { ...bracelet }

  const { updated, log } = await prisma.$transaction(async (tx) => {
    const upd = await tx.bracelet.update({
      where: { id: bracelet.id },
      data: {
        qty: 1,
        returnDate: today,
        remark: newRemark,
        soldDate: null,
        actualPrice: null,
      },
    })
    const lg = await tx.operationLog.create({
      data: {
        braceletId: bracelet.id,
        certNo,
        opType: 'inbound',
        snapshotJson: JSON.stringify(snapshot),
        resultJson: JSON.stringify(upd),
      },
    })
    return { updated: upd, log: lg }
  })

  const excelSync = await syncInboundToExcel(
    toExcelInboundPayload(bracelet, input.remarkText || '', newRemark),
  )
  await recordExcelSync(log.id, excelSync)
  return { ok: true, ...wrapOperationResult(updated, log.id, excelSync) }
}

export async function executeNewInbound(input: NewBraceletDto): Promise<Ok<OperationResult> | Fail> {
  const certNo = normalizeCertNo(input.certNo)
  const exists = await braceletRepo.findByCert(certNo)
  if (exists) return { ok: false, message: `编号 ${certNo} 已存在` }

  const bracelet = await braceletRepo.create({
    certNo,
    arrivalDate: input.arrivalDate || todayStr(),
    batch: input.batch || '',
    qty: 1,
    category: input.category || '',
    ringSize: input.ringSize || '',
    cost: input.cost || '',
    remark: input.remark || '',
  })

  await ensureDetailRecord(bracelet.id)
  if (input.detail) {
    await detailRepo.upsert(bracelet.id, input.detail)
  }

  const log = await operationLogRepo.create({
    braceletId: bracelet.id,
    certNo,
    opType: 'new_inbound',
    snapshotJson: JSON.stringify({}),
    resultJson: JSON.stringify(bracelet),
  })

  const excelSync = await syncNewInboundToExcel(toExcelNewInboundPayload(bracelet))
  await recordExcelSync(log.id, excelSync)

  if (excelSync.ok && excelSync.row) {
    await braceletRepo.update(bracelet.id, {
      excelRow: excelSync.row,
      excelSheet: excelSync.sheet ?? null,
    })
  }

  return { ok: true, ...wrapOperationResult(bracelet, log.id, excelSync) }
}

/** 从 Excel 只读预览一行（用于标签入库表单预填，不写 Excel） */
export async function getExcelRowPreview(certNo: string) {
  const code = normalizeCertNo(certNo)
  if (!code) return { ok: false as const, message: '编号无效' }
  const excel = await fetchExcelRowData(code)
  if (!excel.ok || !excel.data) {
    return { ok: false as const, message: excel.message || `Excel 中未找到 ${code}` }
  }
  return { ok: true as const, data: excel.data }
}

/** 已有标签入库：仅写入数据库并关联 Excel 行号，不修改 Excel */
export async function executeRegisterBracelet(input: NewBraceletDto): Promise<Ok<OperationResult> | Fail> {
  const certNo = normalizeCertNo(input.certNo)
  const exists = await braceletRepo.findByCert(certNo)
  if (exists) return { ok: false, message: `编号 ${certNo} 已在系统中` }

  const excel = await fetchExcelRowData(certNo)
  const row = excel.ok ? excel.data : undefined

  const bracelet = await braceletRepo.create({
    certNo,
    arrivalDate: input.arrivalDate || row?.arrivalDate || todayStr(),
    batch: input.batch ?? row?.batch ?? '',
    qty: row?.qty === 0 ? 0 : 1,
    category: input.category ?? row?.category ?? '',
    ringSize: input.ringSize ?? row?.ringSize ?? '',
    cost: input.cost ?? row?.cost ?? '',
    remark: input.remark ?? row?.remark ?? '',
    orderNo: row?.orderNo || null,
    returnDate: row?.returnDate || null,
    soldDate: row?.soldDate || null,
    actualPrice: row?.actualPrice || null,
    salesPerson: row?.salesPerson || null,
    salesChannel: row?.salesChannel || null,
    excelRow: row?.excelRow ?? null,
    excelSheet: row?.excelSheet ?? null,
  })

  await ensureDetailRecord(bracelet.id)
  if (input.detail) {
    await detailRepo.upsert(bracelet.id, input.detail)
  }

  const log = await operationLogRepo.create({
    braceletId: bracelet.id,
    certNo,
    opType: 'register',
    snapshotJson: JSON.stringify({}),
    resultJson: JSON.stringify(bracelet),
  })

  await operationLogRepo.updateExcelSync(log.id, true, JSON.stringify({
    message: '仅写入数据库，未修改 Excel',
    skipped: true,
  }))

  const excelSync: ExcelSyncResult = {
    ok: true,
    message: row
      ? `已登记到系统（已关联 Excel 第 ${row.excelRow} 行，未修改 Excel）`
      : '已登记到系统（未修改 Excel）',
    row: row?.excelRow,
    sheet: row?.excelSheet,
  }

  const full = await braceletRepo.findByCert(certNo)
  return { ok: true, ...wrapOperationResult(full || bracelet, log.id, excelSync) }
}

/** 从操作日志重放 Excel 同步（数据库已成功、Excel 待补齐时使用） */
export async function executeRetryExcel(logId: string): Promise<Ok<OperationResult> | Fail> {
  const log = await operationLogRepo.findById(logId)
  if (!log) return { ok: false, message: '操作记录不存在' }
  if (log.reverted) return { ok: false, message: '该操作已撤销，无法重试' }
  if (log.excelSynced) return { ok: false, message: 'Excel 已同步，无需重试' }

  const bracelet = await braceletRepo.findByCert(log.certNo)
  if (!bracelet) return { ok: false, message: `编号 ${log.certNo} 不存在` }

  let excelSync: ExcelSyncResult

  if (log.opType === 'outbound') {
    const price = Number(bracelet.actualPrice || 0)
    excelSync = await syncOutboundToExcel(
      toExcelOutboundPayload(bracelet, {
        price,
        remark: '',
        fullRemark: bracelet.remark ?? '',
        salesPerson: bracelet.salesPerson || '',
        salesChannel: bracelet.salesChannel || '',
        orderNo: bracelet.orderNo || '',
      }),
    )
  } else if (log.opType === 'inbound') {
    excelSync = await syncInboundToExcel(
      toExcelInboundPayload(bracelet, '', bracelet.remark ?? ''),
    )
  } else if (log.opType === 'new_inbound') {
    excelSync = await syncNewInboundToExcel(toExcelNewInboundPayload(bracelet))
    if (excelSync.ok && excelSync.row) {
      await braceletRepo.update(bracelet.id, {
        excelRow: excelSync.row,
        excelSheet: excelSync.sheet ?? null,
      })
    }
  } else {
    return { ok: false, message: '不支持的操作类型' }
  }

  await recordExcelSync(log.id, excelSync)
  if (!excelSync.ok) {
    return { ok: false, message: excelSync.message }
  }

  return { ok: true, ...wrapOperationResult(bracelet, log.id, excelSync) }
}

export async function executeRevert(logId: string): Promise<Ok<{ message: string; excelSync?: ExcelSyncResult }> | Fail> {
  const log = await operationLogRepo.findById(logId)
  if (!log) return { ok: false, message: '操作记录不存在' }
  if (log.reverted) return { ok: false, message: '该操作已撤销' }

  const snapshot = JSON.parse(log.snapshotJson) as Record<string, unknown>
  const bracelet = await braceletRepo.findByCert(log.certNo)

  if (log.opType === 'new_inbound') {
    await braceletRepo.delete(log.braceletId)
  } else {
    await braceletRepo.update(log.braceletId, {
      qty: snapshot.qty as number,
      remark: snapshot.remark as string | null,
      returnDate: snapshot.returnDate as string | null,
      soldDate: snapshot.soldDate as string | null,
      actualPrice: snapshot.actualPrice as string | null,
      salesPerson: snapshot.salesPerson as string | null,
      salesChannel: snapshot.salesChannel as string | null,
      orderNo: snapshot.orderNo as string | null,
    })
  }

  let excelSync: ExcelSyncResult | undefined
  if (isExcelBridgeEnabled() && bracelet && log.opType !== 'new_inbound') {
    excelSync = await revertExcelRow({
      certNo: log.certNo,
      opType: log.opType,
      snapshot,
      excelRow: bracelet.excelRow,
      excelSheet: bracelet.excelSheet,
    })
  }

  await operationLogRepo.markReverted(logId)

  const excelNote = excelSync && !excelSync.ok
    ? `（Excel 未同步恢复：${excelSync.message}，请手动核对）`
    : ''

  return { ok: true, message: `已撤销${excelNote}`, excelSync }
}

export async function getExcelSnapshot(certNo: string): Promise<ExcelSyncResult> {
  return fetchExcelRowSnapshot(certNo)
}
