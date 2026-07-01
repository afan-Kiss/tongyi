import {
  getAfterSaleOverview,
  getFinanceAlertsForOrder,
  listAfterSaleItems,
  listPendingAfterSales,
  listRefunds,
  markAfterSaleHandled,
  markAfterSaleIgnored,
} from './afterSaleWorkbench.repository'
import { presentAfterSaleItem } from './afterSaleWorkbench.presenter'

async function withFinance(items: Awaited<ReturnType<typeof listAfterSaleItems>>['items']) {
  const out = []
  for (const row of items) {
    const alerts = await getFinanceAlertsForOrder(row.orderNo)
    out.push(presentAfterSaleItem(row, alerts))
  }
  return out
}

export async function fetchAfterSaleOverview() {
  return getAfterSaleOverview()
}

export async function fetchAfterSaleItems(query: Parameters<typeof listAfterSaleItems>[0]) {
  const data = await listAfterSaleItems(query)
  return { ...data, items: await withFinance(data.items) }
}

export async function fetchRefunds(query: Parameters<typeof listRefunds>[0]) {
  const data = await listRefunds(query)
  return { ...data, items: await withFinance(data.items) }
}

export async function fetchPendingAfterSales(query: Parameters<typeof listPendingAfterSales>[0]) {
  const data = await listPendingAfterSales(query)
  return { ...data, items: await withFinance(data.items) }
}

export async function handleAfterSale(id: string, note?: string) {
  await markAfterSaleHandled(id, note)
  const { prisma } = await import('../../lib/prisma')
  const row = await prisma.qianfanRawAfterSale.findUniqueOrThrow({
    where: { id },
    include: { shop: true },
  })
  const alerts = await getFinanceAlertsForOrder(row.orderNo)
  return presentAfterSaleItem(row, alerts)
}

export async function ignoreAfterSale(id: string, note?: string) {
  await markAfterSaleIgnored(id, note)
  const { prisma } = await import('../../lib/prisma')
  const row = await prisma.qianfanRawAfterSale.findUniqueOrThrow({
    where: { id },
    include: { shop: true },
  })
  const alerts = await getFinanceAlertsForOrder(row.orderNo)
  return presentAfterSaleItem(row, alerts)
}
