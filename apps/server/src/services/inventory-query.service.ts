import { todayStr, normalizeCertNo } from '../domain/inventory.rules'
import { extractCertPrefix, CERT_PREFIXES } from '../domain/cert-no.rules'
import { braceletRepo, operationLogRepo } from '../repositories/bracelet.repository'
import { prisma } from '../lib/prisma'
import { presentOperationLogs } from '../utils/operation-log.presenter'
import { presentBracelet } from '../utils/media-presenter'
import { healBraceletAttachments } from './bracelet-meta-restore.service'

function normalizeScanInput(raw: string): string {
  return raw.replace(/[\r\n\0]+/g, '').trim()
}

/** 仅查数据库（编号 / 条形码），不从 Excel 补建 */
export async function findBraceletInDb(scanInput: string) {
  const scanned = normalizeScanInput(scanInput)
  if (!scanned) return null
  const bracelet = await braceletRepo.findByScanCode(scanned)
  if (!bracelet) return null
  await healBraceletAttachments(bracelet.certNo)
  const fresh = await braceletRepo.findByCert(bracelet.certNo)
  return fresh ? presentBracelet(fresh) : presentBracelet(bracelet)
}

/** 扫码枪输入：编号 / 条形码；仅查数据库，不从 Excel 补建（改库/改 Excel 仅出入库/登记操作） */
export async function queryByCertNo(scanInput: string, _opts?: { syncExcel?: boolean }) {
  return findBraceletInDb(scanInput)
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

  return narrowed.map(presentBracelet)
}

const TODAY_INBOUND_TYPES = ['inbound', 'new_inbound', 'register'] as const
const TODAY_OUTBOUND_TYPES = ['outbound'] as const

export type InventoryListFilter = {
  q?: string
  inStockOnly?: boolean
  outStockOnly?: boolean
  todayOp?: 'inbound' | 'outbound'
  certPrefix?: string
}

async function loadDistinctCertPrefixes(): Promise<string[]> {
  const rows = await prisma.bracelet.findMany({ select: { certNo: true } })
  const set = new Set<string>()
  for (const row of rows) {
    const p = extractCertPrefix(row.certNo)
    if (p) set.add(p)
  }
  return [...set].sort((a, b) => b.length - a.length || a.localeCompare(b))
}

function certPrefixWhere(prefix: string, allPrefixes: string[]): Record<string, unknown> {
  const p = prefix.trim().toUpperCase()
  if (!p || p === '其他') {
    if (!allPrefixes.length) return { id: '__none__' }
    return {
      NOT: {
        OR: allPrefixes.map((pref) => ({ certNo: { startsWith: pref } })),
      },
    }
  }
  const longer = allPrefixes.filter((x) => x.startsWith(p) && x.length > p.length)
  if (!longer.length) return { certNo: { startsWith: p } }
  return {
    AND: [
      { certNo: { startsWith: p } },
      ...longer.map((lp) => ({ certNo: { not: { startsWith: lp } } })),
    ],
  }
}

async function buildListWhere(
  params: InventoryListFilter,
  allPrefixes?: string[],
): Promise<Record<string, unknown>> {
  const clauses: Record<string, unknown>[] = []
  if (params.inStockOnly) clauses.push({ qty: 1 })
  if (params.outStockOnly) clauses.push({ qty: 0 })
  if (params.todayOp) {
    const [y, m, day] = todayStr().split('-').map(Number)
    const since = new Date(y, m - 1, day)
    const types = params.todayOp === 'outbound' ? [...TODAY_OUTBOUND_TYPES] : [...TODAY_INBOUND_TYPES]
    const ids = await operationLogRepo.braceletIdsToday(types, since)
    clauses.push({ id: { in: ids.length ? ids : ['__none__'] } })
  }
  if (params.q) {
    const q = params.q.trim()
    clauses.push({
      OR: [
        { certNo: { contains: q.toUpperCase() } },
        { barcodeValue: { contains: q } },
        { batch: { contains: q } },
        { category: { contains: q } },
        { remark: { contains: q } },
      ],
    })
  }
  if (params.certPrefix) {
    const prefixes = allPrefixes ?? (await loadDistinctCertPrefixes())
    clauses.push(certPrefixWhere(params.certPrefix, prefixes))
  }
  if (!clauses.length) return {}
  if (clauses.length === 1) return clauses[0] as Record<string, unknown>
  return { AND: clauses }
}

export async function queryPrefixCounts(params: InventoryListFilter = {}) {
  const where = await buildListWhere({
    inStockOnly: params.inStockOnly,
    outStockOnly: params.outStockOnly,
    todayOp: params.todayOp,
  })
  const rows = await prisma.bracelet.findMany({
    where,
    select: { certNo: true },
    orderBy: { certNo: 'asc' },
  })
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = extractCertPrefix(row.certNo) ?? '其他'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const orderIndex = (p: string) => {
    const i = (CERT_PREFIXES as readonly string[]).indexOf(p)
    return i >= 0 ? i : 999
  }
  return [...counts.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => {
      if (a.prefix === '其他') return 1
      if (b.prefix === '其他') return -1
      const oa = orderIndex(a.prefix)
      const ob = orderIndex(b.prefix)
      if (oa !== ob) return oa - ob
      return a.prefix.localeCompare(b.prefix, 'zh-CN')
    })
}

export async function queryList(params: InventoryListFilter & {
  page?: number
  pageSize?: number
}) {
  const page = params.page || 1
  const pageSize = params.pageSize || 50
  const allPrefixes = params.certPrefix ? await loadDistinctCertPrefixes() : undefined
  const where = await buildListWhere(params, allPrefixes)
  const [items, total] = await braceletRepo.findMany(where, page, pageSize)
  return { items: items.map(presentBracelet), total, page, pageSize }
}

export async function queryDashboard() {
  const today = todayStr()
  const [y, m, day] = today.split('-').map(Number)
  const since = new Date(y, m - 1, day)
  const [inStock, outOfStock, todayOutbound, todayInbound, recentRaw, todayOutboundRaw, todayInboundRaw] =
    await Promise.all([
      braceletRepo.count({ qty: 1 }),
      braceletRepo.count({ qty: 0 }),
      operationLogRepo.countToday('outbound', since),
      operationLogRepo.countToday(['inbound', 'new_inbound', 'register'], since),
      operationLogRepo.recent(20),
      operationLogRepo.findToday('outbound', since, 50),
      operationLogRepo.findToday(['inbound', 'new_inbound', 'register'], since, 50),
    ])
  return {
    inStock,
    outOfStock,
    todayOutbound,
    todayInbound,
    recentLogs: presentOperationLogs(recentRaw),
    todayOutboundLogs: presentOperationLogs(todayOutboundRaw),
    todayInboundLogs: presentOperationLogs(todayInboundRaw),
  }
}
