import { prisma } from '../lib/prisma'
import {
  computeInboundRemark,
  computeNewRemark,
  normalizeCertNo,
  parseSalePrice,
  todayStr,
} from './inventory.service'
import { DEFAULT_OUTBOUND_REMARK } from '../config/env'
import { syncToExcelBridge } from './excel-bridge.service'

export interface OutboundInput {
  certNo: string
  priceText: string
  remarkText?: string
  salesPerson?: string
  salesChannel?: string
  orderNo?: string
}

export interface InboundInput {
  certNo: string
  remarkText?: string
}

export interface NewBraceletInput {
  certNo: string
  arrivalDate?: string
  batch?: string
  category?: string
  ringSize?: string
  cost?: string
  remark?: string
}

export async function findByCertNo(certNo: string) {
  return prisma.bracelet.findUnique({
    where: { certNo: normalizeCertNo(certNo) },
    include: { mediaAssets: { orderBy: { createdAt: 'desc' } } },
  })
}

export async function listBracelets(params: {
  q?: string
  inStockOnly?: boolean
  page?: number
  pageSize?: number
}) {
  const page = params.page || 1
  const pageSize = params.pageSize || 50
  const where: Record<string, unknown> = {}
  if (params.inStockOnly) where.qty = 1
  if (params.q) {
    where.OR = [
      { certNo: { contains: params.q.toUpperCase() } },
      { batch: { contains: params.q } },
      { category: { contains: params.q } },
      { remark: { contains: params.q } },
    ]
  }
  const [items, total] = await Promise.all([
    prisma.bracelet.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        mediaAssets: { take: 1, orderBy: { createdAt: 'desc' } },
        _count: { select: { mediaAssets: true } },
      },
    }),
    prisma.bracelet.count({ where }),
  ])
  return { items, total, page, pageSize }
}

export async function applyOutbound(input: OutboundInput) {
  const certNo = normalizeCertNo(input.certNo)
  const bracelet = await prisma.bracelet.findUnique({ where: { certNo } })
  if (!bracelet) return { ok: false as const, message: `编号 ${certNo} 不存在` }
  if (bracelet.qty === 0) return { ok: false as const, message: `${certNo} 已出库，请勿重复操作` }

  const { value: priceVal, error: priceErr } = parseSalePrice(input.priceText)
  if (priceErr) return { ok: false as const, message: priceErr }

  const today = todayStr()
  const newRemark = computeNewRemark(bracelet.remark, input.remarkText || DEFAULT_OUTBOUND_REMARK)
  const snapshot = { ...bracelet }

  const updated = await prisma.bracelet.update({
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

  const log = await prisma.operationLog.create({
    data: {
      braceletId: bracelet.id,
      certNo,
      opType: 'outbound',
      snapshotJson: JSON.stringify(snapshot),
      resultJson: JSON.stringify(updated),
    },
  })

  const excelSync = await syncToExcelBridge('outbound', {
    certNo,
    price: priceVal,
    remark: input.remarkText || DEFAULT_OUTBOUND_REMARK,
    salesPerson: input.salesPerson || '',
    salesChannel: input.salesChannel || '',
    orderNo: input.orderNo || '',
    excelRow: bracelet.excelRow,
    excelSheet: bracelet.excelSheet,
  })

  await prisma.operationLog.update({
    where: { id: log.id },
    data: {
      excelSynced: excelSync.ok,
      excelSyncMsg: JSON.stringify({
        message: excelSync.message,
        row: excelSync.row,
        sheet: excelSync.sheet,
        hasSnapshot: !!excelSync.snapshotBase64,
      }),
    },
  })

  return { ok: true as const, bracelet: updated, logId: log.id, excelSync }
}

export async function applyInbound(input: InboundInput) {
  const certNo = normalizeCertNo(input.certNo)
  const bracelet = await prisma.bracelet.findUnique({ where: { certNo } })
  if (!bracelet) return { ok: false as const, message: `编号 ${certNo} 不存在` }
  if (bracelet.qty === 1) return { ok: false as const, message: `${certNo} 已在库，请勿重复入库` }

  const today = todayStr()
  const newRemark = computeInboundRemark(bracelet.remark, input.remarkText, today)
  const snapshot = { ...bracelet }

  const updated = await prisma.bracelet.update({
    where: { id: bracelet.id },
    data: {
      qty: 1,
      returnDate: today,
      remark: newRemark,
      soldDate: null,
      actualPrice: null,
    },
  })

  const log = await prisma.operationLog.create({
    data: {
      braceletId: bracelet.id,
      certNo,
      opType: 'inbound',
      snapshotJson: JSON.stringify(snapshot),
      resultJson: JSON.stringify(updated),
    },
  })

  const excelSync = await syncToExcelBridge('inbound', {
    certNo,
    remark: input.remarkText || '',
    excelRow: bracelet.excelRow,
    excelSheet: bracelet.excelSheet,
  })

  await prisma.operationLog.update({
    where: { id: log.id },
    data: {
      excelSynced: excelSync.ok,
      excelSyncMsg: JSON.stringify({
        message: excelSync.message,
        row: excelSync.row,
        sheet: excelSync.sheet,
        hasSnapshot: !!excelSync.snapshotBase64,
      }),
    },
  })

  return { ok: true as const, bracelet: updated, logId: log.id, excelSync }
}

export async function createBracelet(input: NewBraceletInput) {
  const certNo = normalizeCertNo(input.certNo)
  const exists = await prisma.bracelet.findUnique({ where: { certNo } })
  if (exists) return { ok: false as const, message: `编号 ${certNo} 已存在` }

  const bracelet = await prisma.bracelet.create({
    data: {
      certNo,
      arrivalDate: input.arrivalDate || todayStr(),
      batch: input.batch || '',
      qty: 1,
      category: input.category || '',
      ringSize: input.ringSize || '',
      cost: input.cost || '',
      remark: input.remark || '',
    },
  })

  const log = await prisma.operationLog.create({
    data: {
      braceletId: bracelet.id,
      certNo,
      opType: 'new_inbound',
      snapshotJson: JSON.stringify({}),
      resultJson: JSON.stringify(bracelet),
    },
  })

  const excelSync = await syncToExcelBridge('new_inbound', {
    certNo,
    arrivalDate: bracelet.arrivalDate,
    batch: bracelet.batch,
    category: bracelet.category,
    ringSize: bracelet.ringSize,
    cost: bracelet.cost,
    remark: bracelet.remark,
  })

  await prisma.operationLog.update({
    where: { id: log.id },
    data: {
      excelSynced: excelSync.ok,
      excelSyncMsg: JSON.stringify({
        message: excelSync.message,
        row: excelSync.row,
        sheet: excelSync.sheet,
        hasSnapshot: !!excelSync.snapshotBase64,
      }),
    },
  })

  return { ok: true as const, bracelet, logId: log.id, excelSync }
}

export async function revertOperation(logId: string) {
  const log = await prisma.operationLog.findUnique({ where: { id: logId } })
  if (!log) return { ok: false as const, message: '操作记录不存在' }
  if (log.reverted) return { ok: false as const, message: '该操作已撤销' }

  const snapshot = JSON.parse(log.snapshotJson)
  if (log.opType === 'new_inbound') {
    await prisma.bracelet.delete({ where: { id: log.braceletId } })
  } else {
    await prisma.bracelet.update({
      where: { id: log.braceletId },
      data: {
        qty: snapshot.qty,
        remark: snapshot.remark,
        returnDate: snapshot.returnDate,
        soldDate: snapshot.soldDate,
        actualPrice: snapshot.actualPrice,
        salesPerson: snapshot.salesPerson,
        salesChannel: snapshot.salesChannel,
        orderNo: snapshot.orderNo,
      },
    })
  }

  await prisma.operationLog.update({
    where: { id: logId },
    data: { reverted: true },
  })

  return { ok: true as const, message: '已撤销' }
}

export async function getDashboardStats() {
  const today = todayStr()
  const [inStock, outOfStock, todayOutbound, todayInbound, recentLogs] = await Promise.all([
    prisma.bracelet.count({ where: { qty: 1 } }),
    prisma.bracelet.count({ where: { qty: 0 } }),
    prisma.operationLog.count({ where: { opType: 'outbound', createdAt: { gte: new Date(today) }, reverted: false } }),
    prisma.operationLog.count({
      where: {
        opType: { in: ['inbound', 'new_inbound'] },
        createdAt: { gte: new Date(today) },
        reverted: false,
      },
    }),
    prisma.operationLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { bracelet: true },
    }),
  ])
  return { inStock, outOfStock, todayOutbound, todayInbound, recentLogs }
}
