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
      include: { bracelet: true },
    })
  },

  countToday(opType: string | string[], since: Date) {
    const types = Array.isArray(opType) ? opType : [opType]
    return prisma.operationLog.count({
      where: { opType: { in: types }, createdAt: { gte: since }, reverted: false },
    })
  },
}
