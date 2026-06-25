import { prisma } from '../lib/prisma'
import { normalizeCertNo } from '../domain/inventory.rules'

export const braceletRepo = {
  findByCert(certNo: string) {
    return prisma.bracelet.findUnique({
      where: { certNo: normalizeCertNo(certNo) },
      include: {
        detail: true,
        mediaAssets: { orderBy: { createdAt: 'desc' } },
      },
    })
  },

  findByBarcode(barcodeValue: string) {
    const code = barcodeValue.trim()
    if (!code) return Promise.resolve(null)
    return prisma.bracelet.findFirst({
      where: { barcodeValue: code },
      include: {
        detail: true,
        mediaAssets: { orderBy: { createdAt: 'desc' } },
      },
    })
  },

  /** 扫码匹配条件：编号或条形码，兼容大小写、空白、回车与前导零 */
  scanCodeWhere(raw: string) {
    const code = raw.replace(/[\r\n\0]+/g, '').trim()
    if (!code) return null
    const compact = code.replace(/\s+/g, '')
    const certVariants = [
      ...new Set([code, compact, code.toUpperCase(), compact.toUpperCase()].filter(Boolean)),
    ].map((v) => normalizeCertNo(v))

    const barcodeVariants = new Set<string>([code, compact, code.toUpperCase(), compact.toUpperCase()])
    for (const v of [code, compact]) {
      if (/^\d+$/.test(v)) {
        const stripped = v.replace(/^0+/, '') || '0'
        barcodeVariants.add(stripped)
        const baseLen = Math.max(stripped.length, v.length)
        for (let len = baseLen; len <= baseLen + 3; len++) {
          barcodeVariants.add(stripped.padStart(len, '0'))
        }
      }
    }

    return {
      OR: [
        ...certVariants.map((v) => ({ certNo: v })),
        ...[...barcodeVariants].map((v) => ({ barcodeValue: v })),
      ],
    }
  },

  /** 扫码枪：编号或条形码，兼容大小写、空白、回车与前导零 */
  findByScanCode(raw: string) {
    const where = this.scanCodeWhere(raw)
    if (!where) return Promise.resolve(null)
    return prisma.bracelet.findFirst({
      where,
      include: {
        detail: true,
        mediaAssets: { orderBy: { createdAt: 'desc' } },
      },
    })
  },

  /** 扫码枪：返回所有匹配记录（条形码重复、编号片段等） */
  findAllByScanCode(raw: string, take = 50) {
    const where = this.scanCodeWhere(raw)
    if (!where) return Promise.resolve([])
    return prisma.bracelet.findMany({
      where,
      take,
      orderBy: [{ certNo: 'asc' }, { updatedAt: 'desc' }],
      include: {
        detail: true,
        mediaAssets: { orderBy: { createdAt: 'desc' } },
      },
    })
  },

  findMany(where: Record<string, unknown>, page: number, pageSize: number) {
    return Promise.all([
      prisma.bracelet.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          detail: true,
          mediaAssets: { take: 4, orderBy: { createdAt: 'desc' } },
          _count: { select: { mediaAssets: true } },
        },
      }),
      prisma.bracelet.count({ where }),
    ])
  },

  update(id: string, data: Record<string, unknown>) {
    return prisma.bracelet.update({ where: { id }, data })
  },

  create(data: Record<string, unknown>) {
    return prisma.bracelet.create({ data: data as Parameters<typeof prisma.bracelet.create>[0]['data'] })
  },

  delete(id: string) {
    return prisma.bracelet.delete({ where: { id } })
  },

  count(where?: Record<string, unknown>) {
    return prisma.bracelet.count({ where })
  },

  listCertNos() {
    return prisma.bracelet.findMany({ select: { certNo: true } })
  },
}

export const operationLogRepo = {
  create(data: {
    braceletId: string
    certNo: string
    opType: string
    snapshotJson: string
    resultJson: string
  }) {
    return prisma.operationLog.create({ data })
  },

  updateExcelSync(id: string, excelSynced: boolean, excelSyncMsg: string) {
    return prisma.operationLog.update({ where: { id }, data: { excelSynced, excelSyncMsg } })
  },

  findById(id: string) {
    return prisma.operationLog.findUnique({ where: { id } })
  },

  markReverted(id: string) {
    return prisma.operationLog.update({ where: { id }, data: { reverted: true } })
  },

  recent(take: number) {
    return prisma.operationLog.findMany({
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        bracelet: {
          select: { id: true, certNo: true, category: true, batch: true, ringSize: true, cost: true },
        },
      },
    })
  },

  /** 待补齐 Excel 同步的操作（未撤销、支持重试的类型） */
  findPendingExcelSync(take = 20) {
    return prisma.operationLog.findMany({
      where: {
        excelSynced: false,
        reverted: false,
        opType: { in: ['outbound', 'inbound', 'new_inbound'] },
      },
      orderBy: { createdAt: 'asc' },
      take,
    })
  },

  /** 该编号最近一次含 Excel 改前/改后截图的出入库操作（未撤销） */
  findLatestExcelSyncByCert(certNo: string) {
    return prisma.operationLog.findFirst({
      where: {
        certNo,
        reverted: false,
        excelSyncMsg: { not: null },
        opType: { in: ['outbound', 'inbound', 'new_inbound'] },
      },
      orderBy: { createdAt: 'desc' },
    })
  },

  /** 今日某类操作（未撤销） */
  findToday(opType: string | string[], since: Date, take = 30) {
    const types = Array.isArray(opType) ? opType : [opType]
    return prisma.operationLog.findMany({
      where: { opType: { in: types }, createdAt: { gte: since }, reverted: false },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        bracelet: {
          select: { id: true, certNo: true, category: true, batch: true, ringSize: true, cost: true },
        },
      },
    })
  },

  countToday(opType: string | string[], since: Date) {
    const types = Array.isArray(opType) ? opType : [opType]
    return prisma.operationLog.count({
      where: { opType: { in: types }, createdAt: { gte: since }, reverted: false },
    })
  },

  /** 今日操作涉及的手镯 ID（去重，与总览统计口径一致） */
  braceletIdsToday(opType: string | string[], since: Date) {
    const types = Array.isArray(opType) ? opType : [opType]
    return prisma.operationLog
      .findMany({
        where: { opType: { in: types }, createdAt: { gte: since }, reverted: false },
        select: { braceletId: true },
        distinct: ['braceletId'],
      })
      .then((rows) => rows.map((r) => r.braceletId))
  },
}
