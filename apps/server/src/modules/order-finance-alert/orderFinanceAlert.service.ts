import { prisma } from '../../lib/prisma'
import { getJizhangWebUrl } from '../../config/env'
import { presentFinanceAlert, type CreateFinanceAlertInput, type ScanFinanceContext } from './orderFinanceAlert.presenter'

function norm(v?: string | null) {
  return String(v || '').trim()
}

export async function searchFinanceAlerts(query: {
  orderNo?: string
  logisticsNo?: string
  trackingNo?: string
  buyerPhone?: string
  status?: string
}) {
  const orderNo = norm(query.orderNo)
  const logisticsNo = norm(query.logisticsNo)
  const trackingNo = norm(query.trackingNo)
  const buyerPhone = norm(query.buyerPhone)
  const status = norm(query.status) || 'pending'

  const or: Array<Record<string, string>> = []
  if (logisticsNo) or.push({ logisticsNo })
  if (trackingNo) or.push({ trackingNo })
  if (orderNo) or.push({ orderNo })
  if (buyerPhone) or.push({ buyerPhone })

  if (!or.length) {
    return { alerts: [], warning: undefined as string | undefined }
  }

  const rows = await prisma.orderFinanceAlert.findMany({
    where: {
      status,
      OR: or,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return { alerts: rows.map(presentFinanceAlert), warning: undefined as string | undefined }
}

export async function findAlertsForScanResult(ctx: ScanFinanceContext) {
  try {
    const logisticsNo = norm(ctx.logisticsNo)
    const trackingNo = norm(ctx.trackingNo)
    const orderNo = norm(ctx.orderNo)
    const buyerPhone = norm(ctx.buyerPhone)

    const queries: Array<{ field: string; value: string }> = []
    if (logisticsNo) queries.push({ field: 'logisticsNo', value: logisticsNo })
    if (trackingNo) queries.push({ field: 'trackingNo', value: trackingNo })
    if (orderNo) queries.push({ field: 'orderNo', value: orderNo })
    if (buyerPhone) queries.push({ field: 'buyerPhone', value: buyerPhone })

    if (!queries.length) {
      return { alerts: [] as ReturnType<typeof presentFinanceAlert>[], warning: undefined as string | undefined }
    }

    for (const q of queries) {
      const rows = await prisma.orderFinanceAlert.findMany({
        where: { status: 'pending', [q.field]: q.value },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      if (rows.length) {
        return { alerts: rows.map(presentFinanceAlert), warning: undefined }
      }
    }

    return { alerts: [], warning: undefined }
  } catch (err) {
    console.warn('[finance-alert] 查询失败，不影响扫码:', err instanceof Error ? err.message : err)
    return {
      alerts: [],
      warning: '记账提醒暂时不可用，扫码不受影响',
    }
  }
}

export async function createFinanceAlert(input: CreateFinanceAlertInput & { accountingRecordId?: string }) {
  const row = await prisma.orderFinanceAlert.create({
    data: {
      source: input.source || 'manual',
      orderNo: norm(input.orderNo) || null,
      logisticsNo: norm(input.logisticsNo) || null,
      trackingNo: norm(input.trackingNo) || null,
      buyerName: norm(input.buyerName) || null,
      buyerPhone: norm(input.buyerPhone) || null,
      type: input.type,
      amount: input.amount ?? null,
      title: norm(input.title) || null,
      message: norm(input.message) || null,
      externalId: norm(input.externalId) || null,
      accountingRecordId: norm(input.accountingRecordId) || null,
      rawJson: JSON.stringify(input.rawJson || {}),
      status: 'pending',
    },
  })
  return presentFinanceAlert(row)
}

export async function markAlertHandled(id: string) {
  const row = await prisma.orderFinanceAlert.update({
    where: { id },
    data: { status: 'handled', handledAt: new Date() },
  })
  if (row.accountingRecordId) {
    const { syncAccountingStatusFromAlert } = await import('../accounting/accounting-finance-bridge')
    await syncAccountingStatusFromAlert(row.accountingRecordId, 'handled')
  }
  return presentFinanceAlert(row)
}

export async function markAlertIgnored(id: string) {
  const row = await prisma.orderFinanceAlert.update({
    where: { id },
    data: { status: 'ignored', handledAt: new Date() },
  })
  if (row.accountingRecordId) {
    const { syncAccountingStatusFromAlert } = await import('../accounting/accounting-finance-bridge')
    await syncAccountingStatusFromAlert(row.accountingRecordId, 'ignored')
  }
  return presentFinanceAlert(row)
}

export async function syncFromJizhang() {
  const base = getJizhangWebUrl()
  if (!base) {
    return {
      synced: 0,
      message: '未配置 JIZHANG_WEB_URL，暂无法从记账系统自动同步。可先手动创建提醒。',
    }
  }

  const apiUrl = process.env.JIZHANG_API_URL?.trim() || `${base.replace(/\/$/, '')}/api/finance-alerts`
  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      return {
        synced: 0,
        message: `记账系统 API 暂不可用（HTTP ${res.status}）。可先手动维护提醒。`,
      }
    }
    const data = (await res.json()) as { items?: CreateFinanceAlertInput[] }
    const items = Array.isArray(data.items) ? data.items : []
    let synced = 0
    for (const item of items) {
      if (!item.type) continue
      await createFinanceAlert({ ...item, source: 'jizhang' })
      synced += 1
    }
    return { synced, message: synced ? `已从记账系统同步 ${synced} 条提醒` : '记账系统暂无新提醒' }
  } catch {
    return {
      synced: 0,
      message: '记账系统离线或 API 未实现，暂无法自动同步。可先手动创建提醒。',
    }
  }
}
