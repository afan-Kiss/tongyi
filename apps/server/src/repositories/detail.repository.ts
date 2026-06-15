import { prisma } from '../lib/prisma'

export interface BraceletDetailInput {
  description?: string
  material?: string
  jadeGrade?: string
  weightGram?: string
  origin?: string
  color?: string
  flawNotes?: string
  internalNote?: string
  tags?: string
  extraJson?: string
}

export const detailRepo = {
  findByBraceletId(braceletId: string) {
    return prisma.braceletDetail.findUnique({ where: { braceletId } })
  },

  findByCertNo(certNo: string) {
    return prisma.braceletDetail.findFirst({
      where: { bracelet: { certNo } },
      include: { bracelet: { include: { mediaAssets: { orderBy: { createdAt: 'desc' } } } } },
    })
  },

  createEmpty(braceletId: string) {
    return prisma.braceletDetail.create({ data: { braceletId } })
  },

  upsert(braceletId: string, data: BraceletDetailInput) {
    return prisma.braceletDetail.upsert({
      where: { braceletId },
      create: { braceletId, ...data },
      update: data,
    })
  },
}
