import { todayStr } from '../domain/inventory.rules'
import { braceletRepo, operationLogRepo } from '../repositories/bracelet.repository'
import { presentBracelet } from '../utils/media-presenter'
import { upsertBraceletFromExcel } from './excel-row-sync.service'

export async function queryByCertNo(certNo: string) {
  let bracelet = await braceletRepo.findByCert(certNo)
  if (!bracelet) {
    bracelet = await upsertBraceletFromExcel(certNo)
  }
  return bracelet ? presentBracelet(bracelet) : null
}

export async function queryList(params: {
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
  const [items, total] = await braceletRepo.findMany(where, page, pageSize)
  return { items: items.map(presentBracelet), total, page, pageSize }
}

export async function queryDashboard() {
  const today = todayStr()
  const since = new Date(today)
  const [inStock, outOfStock, todayOutbound, todayInbound, recentLogs] = await Promise.all([
    braceletRepo.count({ qty: 1 }),
    braceletRepo.count({ qty: 0 }),
    operationLogRepo.countToday('outbound', since),
    operationLogRepo.countToday(['inbound', 'new_inbound', 'register'], since),
    operationLogRepo.recent(20),
  ])
  return { inStock, outOfStock, todayOutbound, todayInbound, recentLogs }
}
