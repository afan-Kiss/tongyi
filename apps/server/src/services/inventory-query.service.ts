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

function dedupeBracelets<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/** 多条扫码结果：若编号完全一致则只保留该编号下的全部记录 */
function narrowScanResults<T extends { id: string; certNo: string; barcodeValue?: string | null }>(
  items: T[],
  scanned: string,
): T[] {
  const deduped = dedupeBracelets(items)
  if (deduped.length <= 1) return deduped

  const norm = normalizeCertNo(scanned)
  const exactCert = deduped.filter((b) => b.certNo.toUpperCase() === norm.toUpperCase())
  if (exactCert.length > 0) {
    const cert = exactCert[0].certNo
    return deduped.filter((b) => b.certNo === cert)
  }

  const compact = scanned.replace(/\s+/g, '')
  const barcodeHits = deduped.filter((b) => {
    const bc = b.barcodeValue?.trim()
    if (!bc) return false
    return bc === compact || bc === scanned || bc.toUpperCase() === scanned.toUpperCase()
  })
  if (barcodeHits.length > 1) return barcodeHits

  const byCert = new Map<string, T[]>()
  for (const b of deduped) {
    const list = byCert.get(b.certNo) || []
    list.push(b)
    byCert.set(b.certNo, list)
  }
  let largest = deduped
  for (const group of byCert.values()) {
    if (group.length > largest.length) largest = group
  }
  if (largest.length > 1 && largest.length < deduped.length) return largest

  return deduped
}

/** 扫码枪：返回全部匹配（查询模式可合并列表搜索） */
export async function queryByScanCode(
  scanInput: string,
  opts?: { syncExcel?: boolean; includeList?: boolean },
) {
  const scanned = normalizeScanInput(scanInput)
  if (!scanned) return []

  const rawItems = await braceletRepo.findAllByScanCode(scanned)
  let merged = rawItems

  if (opts?.includeList) {
    const q = scanned.trim()
    const where = {
      OR: [
        { certNo: { contains: q.toUpperCase() } },
        { barcodeValue: { contains: q } },
        { batch: { contains: q } },
        { category: { contains: q } },
        { remark: { contains: q } },
      ],
    }
    const [listItems] = await braceletRepo.findMany(where, 1, 50)
    merged = dedupeBracelets([...rawItems, ...listItems])
  }

  let narrowed = narrowScanResults(merged, scanned)

  if (!narrowed.length && opts?.syncExcel !== false) {
    const created = await upsertBraceletFromExcel(normalizeCertNo(scanned))
    if (created) narrowed = [created]
  }

  return narrowed.map(presentBracelet)
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
