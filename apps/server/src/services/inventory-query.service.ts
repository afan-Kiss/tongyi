import { todayStr, normalizeCertNo } from '../domain/inventory.rules'
import { braceletRepo, operationLogRepo } from '../repositories/bracelet.repository'
import { presentBracelet } from '../utils/media-presenter'
import { upsertBraceletFromExcel } from './excel-row-sync.service'

function normalizeScanInput(raw: string): string {
  return raw.replace(/[\r\n\0]+/g, '').trim()
}

/** 仅查数据库（编号 / 条形码），不从 Excel 补建 */
export async function findBraceletInDb(scanInput: string) {
  const scanned = normalizeScanInput(scanInput)
  if (!scanned) return null
  const bracelet = await braceletRepo.findByScanCode(scanned)
  return bracelet ? presentBracelet(bracelet) : null
}

/** 扫码枪输入：编号 / 条形码；可选从 Excel 补建（扫码工作台用） */
export async function queryByCertNo(scanInput: string, opts?: { syncExcel?: boolean }) {
  const scanned = normalizeScanInput(scanInput)
  if (!scanned) return null

  let bracelet = await braceletRepo.findByScanCode(scanned)
  if (!bracelet && opts?.syncExcel !== false) {
    bracelet = await upsertBraceletFromExcel(normalizeCertNo(scanned))
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
    const q = params.q.trim()
    where.OR = [
      { certNo: { contains: q.toUpperCase() } },
      { barcodeValue: { contains: q } },
      { batch: { contains: q } },
      { category: { contains: q } },
      { remark: { contains: q } },
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
