import { prisma } from '../../lib/prisma'
import type { NormalizedAfterSale, NormalizedLiveSession, NormalizedOrder } from './qianfanSync.types'

async function ensureAnchor(name: string) {
  const trimmed = name.trim()
  if (!trimmed) return null
  return prisma.anchorProfile.upsert({
    where: { name: trimmed },
    create: { name: trimmed, displayName: trimmed },
    update: {},
  })
}

export async function syncOrdersToLiveBusiness(shopName: string, orders: NormalizedOrder[]) {
  let sessions = 0
  let liveOrders = 0

  const bySession = new Map<string, NormalizedOrder[]>()
  for (const order of orders) {
    const sessionNo = order.liveSessionNo || `daily-${order.paidAt?.toISOString().slice(0, 10) || 'unknown'}-${order.anchorName || shopName}`
    const list = bySession.get(sessionNo) || []
    list.push(order)
    bySession.set(sessionNo, list)
  }

  for (const [sessionNo, sessionOrders] of bySession) {
    const anchorName = sessionOrders.find((o) => o.anchorName)?.anchorName || shopName
    const anchor = await ensureAnchor(anchorName)
    const startedAt = sessionOrders.reduce<Date | null>((min, o) => {
      if (!o.paidAt) return min
      if (!min || o.paidAt < min) return o.paidAt
      return min
    }, null)
    const endedAt = sessionOrders.reduce<Date | null>((max, o) => {
      if (!o.paidAt) return max
      if (!max || o.paidAt > max) return o.paidAt
      return max
    }, null)

    const gross = sessionOrders.reduce((s, o) => s + o.payAmount, 0)
    const valid = sessionOrders.reduce((s, o) => s + o.validAmount, 0)
    const refund = sessionOrders.reduce((s, o) => s + o.refundAmount, 0)

    const session = await prisma.liveSession.upsert({
      where: { sessionNo },
      create: {
        sessionNo,
        title: `${shopName} 同步场次`,
        anchorName,
        anchorProfileId: anchor?.id,
        startedAt: startedAt || new Date(),
        endedAt,
        grossSalesAmount: gross,
        validSalesAmount: valid,
        refundAmount: refund,
        orderCount: sessionOrders.length,
        platform: 'xiaohongshu',
        rawJson: JSON.stringify({ source: 'qianfan-sync', shopName }),
      },
      update: {
        anchorName,
        anchorProfileId: anchor?.id,
        endedAt,
        grossSalesAmount: gross,
        validSalesAmount: valid,
        refundAmount: refund,
        orderCount: sessionOrders.length,
      },
    })
    sessions += 1

    for (const order of sessionOrders) {
      await prisma.liveOrder.upsert({
        where: { sessionId_orderNo: { sessionId: session.id, orderNo: order.orderNo } },
        create: {
          sessionId: session.id,
          orderNo: order.orderNo,
          buyerName: order.buyerName,
          productName: order.productTitle,
          skuName: order.skuTitle,
          amount: order.payAmount,
          validAmount: order.validAmount,
          refundAmount: order.refundAmount,
          afterSaleStatus: order.afterSaleStatus,
          paidAt: order.paidAt,
          rawJson: JSON.stringify(order.raw),
        },
        update: {
          buyerName: order.buyerName,
          productName: order.productTitle,
          skuName: order.skuTitle,
          amount: order.payAmount,
          validAmount: order.validAmount,
          refundAmount: order.refundAmount,
          afterSaleStatus: order.afterSaleStatus,
          paidAt: order.paidAt,
          rawJson: JSON.stringify(order.raw),
        },
      })
      liveOrders += 1
    }
  }

  return { sessions, liveOrders }
}

export async function syncLiveSessionsToBusiness(rows: NormalizedLiveSession[]) {
  let count = 0
  for (const row of rows) {
    const anchorName = row.anchorName || '未知主播'
    const anchor = await ensureAnchor(anchorName)
    await prisma.liveSession.upsert({
      where: { sessionNo: row.sessionNo },
      create: {
        sessionNo: row.sessionNo,
        title: row.title,
        anchorName,
        anchorProfileId: anchor?.id,
        startedAt: row.startedAt || new Date(),
        endedAt: row.endedAt,
        grossSalesAmount: row.grossSalesAmount,
        validSalesAmount: row.validSalesAmount,
        refundAmount: row.refundAmount,
        orderCount: row.orderCount,
        rawJson: JSON.stringify(row.raw),
      },
      update: {
        title: row.title,
        anchorName,
        anchorProfileId: anchor?.id,
        endedAt: row.endedAt,
        grossSalesAmount: row.grossSalesAmount,
        validSalesAmount: row.validSalesAmount,
        refundAmount: row.refundAmount,
        orderCount: row.orderCount,
        rawJson: JSON.stringify(row.raw),
      },
    })
    count += 1
  }
  return count
}

export async function syncAfterSalesToOrders(afterSales: NormalizedAfterSale[]) {
  let updated = 0
  for (const row of afterSales) {
    if (!row.orderNo) continue
    const orders = await prisma.liveOrder.findMany({ where: { orderNo: row.orderNo } })
    for (const order of orders) {
      await prisma.liveOrder.update({
        where: { id: order.id },
        data: {
          refundAmount: row.refundAmount,
          afterSaleStatus: row.status,
          validAmount: Math.max(0, order.amount - row.refundAmount),
        },
      })
      updated += 1
      const session = await prisma.liveSession.findUnique({ where: { id: order.sessionId } })
      if (session) {
        const agg = await prisma.liveOrder.aggregate({
          where: { sessionId: session.id },
          _sum: { amount: true, validAmount: true, refundAmount: true },
          _count: true,
        })
        await prisma.liveSession.update({
          where: { id: session.id },
          data: {
            grossSalesAmount: agg._sum.amount || 0,
            validSalesAmount: agg._sum.validAmount || 0,
            refundAmount: agg._sum.refundAmount || 0,
            orderCount: agg._count,
          },
        })
      }
    }

    if (row.refundAmount > 0) {
      const externalId = `qianfan-aftersale-${row.afterSaleNo}`
      const exists = await prisma.orderFinanceAlert.findFirst({ where: { externalId } })
      if (!exists) {
        await prisma.orderFinanceAlert.create({
          data: {
            source: 'qianfan-sync',
            orderNo: row.orderNo,
            type: 'refund',
            amount: row.refundAmount,
            title: '千帆售后退款提醒',
            message: row.reason || '检测到售后退款，请核对记账',
            status: 'pending',
            externalId,
            rawJson: JSON.stringify(row.raw),
          },
        })
      }
    }
  }
  return updated
}
