import fs from 'node:fs'
import { prisma } from '../../lib/prisma'
import {
  createImportBatch,
  finishImportBatch,
  recalcSessionTotals,
  upsertAnchorProfile,
} from './liveAnalysis.repository'
import { openLegacyDatabase, resolveLegacyLiveAnalysisDbPath, tableExists } from '../../lib/legacy-sqlite'
import {
  buildValidRevenueInputFromRow,
  centToYuan,
  resolveValidRevenueAmountCent,
  yuanToCent,
} from './liveAnalysis-valid-revenue'

export interface LiveLegacyImportResult {
  imported: number
  skipped: number
  failed: number
  sessions: number
  orders: number
  anchors: number
  errors: string[]
  dbPath: string
  batchId?: string
  warnings: string[]
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  return {}
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  return ''
}

function pickAmountYuan(obj: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = obj[k]
    if (v == null || v === '') continue
    const n = Number(String(v).replace(/[,，¥]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return 0
}

function parseLegacyDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

function extractOrderFields(raw: unknown) {
  const obj = asRecord(raw)
  const orderNo =
    pickString(obj, ['packageId', 'orderId', 'orderNo', 'displayOrderNo', 'externalOrderNo']) || ''
  const orderStatus = pickString(obj, ['orderStatus', 'status', 'orderStatusText', 'packageStatus'])
  const afterSaleStatus = pickString(obj, [
    'afterSaleStatus',
    'afterSaleStatusText',
    'afterSaleStatusLabel',
    'refundStatus',
  ])
  const productName = pickString(obj, ['skuName', 'productName', 'goodsName', 'itemName', 'title'])
  const buyerName = pickString(obj, ['buyerNick', 'buyerName', 'userName', 'receiverName'])
  const amount = pickAmountYuan(obj, [
    'actualSellerReceiveAmount',
    'payAmount',
    'paidAmount',
    'totalPayAmount',
    'merchantReceiveAmount',
    'goodsPayAmount',
  ])
  const refundAmount = pickAmountYuan(obj, [
    'refundAmount',
    'productRefundAmount',
    'returnAmount',
    'afterSaleRefundAmount',
  ])
  const paidAt = parseLegacyDate(
    pickString(obj, ['payTime', 'paidTime', 'paymentTime', 'orderPayTime']) ||
      obj.payTime ||
      obj.paidTime,
  )
  const anchorName =
    pickString(obj, ['anchorName', 'liveAnchorName', 'hostName']) ||
    pickString(asRecord(obj.liveInfo), ['anchorName', 'hostName'])

  const paymentBaseCent = yuanToCent(amount)
  const refundCent = yuanToCent(refundAmount)
  const validInput = buildValidRevenueInputFromRow({
    amount,
    refundAmount,
    orderStatus: orderStatus || '已完成',
    afterSaleStatus,
  })
  const validAmount = centToYuan(resolveValidRevenueAmountCent(validInput))

  return {
    orderNo,
    orderStatus,
    afterSaleStatus,
    productName,
    buyerName,
    amount,
    refundAmount,
    validAmount,
    paidAt,
    anchorName,
    paymentBaseCent,
    refundCent,
    rawJson: JSON.stringify(obj),
  }
}

export async function runLegacyLiveAnalysisImport(options?: {
  dbPath?: string
  limit?: number
}): Promise<LiveLegacyImportResult> {
  const dbPath = resolveLegacyLiveAnalysisDbPath(options?.dbPath)
  const result: LiveLegacyImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    sessions: 0,
    orders: 0,
    anchors: 0,
    errors: [],
    dbPath,
    warnings: [],
  }

  if (!fs.existsSync(dbPath)) {
    result.errors.push(`旧主播分析库不存在：${dbPath}。请确认路径或设置 LEGACY_LIVE_ANALYSIS_DB。`)
    return result
  }

  const batch = await createImportBatch({ source: 'legacy-db', filename: dbPath })
  result.batchId = batch.id

  const db = openLegacyDatabase(dbPath, true)
  const sessionCache = new Map<string, string>()
  const defaultSessionNo = 'LEGACY-UNASSIGNED'

  try {
    if (tableExists(db, 'Anchor')) {
      const anchors = db.prepare(`SELECT name, defaultLiveRoomName FROM Anchor WHERE enabled = 1 AND deletedAt IS NULL`).all() as Array<{
        name: string
        defaultLiveRoomName: string | null
      }>
      for (const a of anchors) {
        try {
          await upsertAnchorProfile(a.name, a.defaultLiveRoomName || a.name)
          result.anchors += 1
        } catch (err) {
          result.warnings.push(`主播 ${a.name} 导入跳过：${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } else {
      result.warnings.push('旧库没有 Anchor 表，将仅使用订单/场次里的主播名。')
    }

    if (tableExists(db, 'XhsRawLiveSession')) {
      const sessions = db
        .prepare(
          `SELECT id, liveName, anchorName, startTime, endTime, liveAccountName, rawJson FROM XhsRawLiveSession ORDER BY startTime DESC`,
        )
        .all() as Array<{
        id: string
        liveName: string | null
        anchorName: string | null
        startTime: string | null
        endTime: string | null
        liveAccountName: string | null
        rawJson: string
      }>

      for (const s of sessions) {
        try {
          const sessionNo = `LEG-LIVE-${s.id}`
          const existing = await prisma.liveSession.findUnique({ where: { sessionNo } })
          if (existing) {
            sessionCache.set(sessionNo, existing.id)
            result.skipped += 1
            continue
          }
          const anchorName = (s.anchorName || s.liveAccountName || '未命名主播').trim()
          const anchor = await upsertAnchorProfile(anchorName)
          const startedAt = s.startTime ? new Date(s.startTime) : new Date()
          const row = await prisma.liveSession.create({
            data: {
              sessionNo,
              title: s.liveName || null,
              anchorName,
              anchorProfileId: anchor.id,
              startedAt,
              endedAt: s.endTime ? new Date(s.endTime) : null,
              platform: 'xiaohongshu',
              status: 'completed',
              rawJson: typeof s.rawJson === 'string' ? s.rawJson : JSON.stringify(s.rawJson),
            },
          })
          sessionCache.set(sessionNo, row.id)
          result.sessions += 1
          result.imported += 1
        } catch (err) {
          result.failed += 1
          result.errors.push(`LiveSession ${s.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } else {
      result.warnings.push('旧库没有 XhsRawLiveSession 表，订单将归入默认场次。')
    }

    if (!tableExists(db, 'XhsRawOrder')) {
      result.warnings.push('旧库没有 XhsRawOrder 表，无法导入订单。')
      await finishImportBatch(batch.id, {
        status: 'completed',
        importedCount: result.imported,
        errorMessage: result.warnings.join('；') || undefined,
      })
      return result
    }

    const limit = options?.limit && options.limit > 0 ? options.limit : undefined
    const orders = limit
      ? (db.prepare(`SELECT id, orderId, packageId, orderTime, liveAccountName, rawJson FROM XhsRawOrder ORDER BY orderTime DESC LIMIT ?`).all(limit) as Array<{
          id: string
          orderId: string | null
          packageId: string | null
          orderTime: string | null
          liveAccountName: string | null
          rawJson: string
        }>)
      : (db.prepare(`SELECT id, orderId, packageId, orderTime, liveAccountName, rawJson FROM XhsRawOrder ORDER BY orderTime DESC`).all() as Array<{
          id: string
          orderId: string | null
          packageId: string | null
          orderTime: string | null
          liveAccountName: string | null
          rawJson: string
        }>)

    for (const o of orders) {
      try {
        const fields = extractOrderFields(o.rawJson)
        const orderNo = fields.orderNo || o.packageId || o.orderId || o.id
        if (!orderNo) {
          result.skipped += 1
          continue
        }

        const anchorName = (fields.anchorName || o.liveAccountName || '未命名主播').trim()
        const dayKey = (fields.paidAt || (o.orderTime ? new Date(o.orderTime) : new Date())).toISOString().slice(0, 10)
        const sessionNo = `LEG-DAY-${anchorName}-${dayKey}`
        let sessionId = sessionCache.get(sessionNo)

        if (!sessionId) {
          const existing = await prisma.liveSession.findUnique({ where: { sessionNo } })
          if (existing) {
            sessionId = existing.id
          } else {
            const anchor = await upsertAnchorProfile(anchorName)
            const created = await prisma.liveSession.create({
              data: {
                sessionNo,
                title: `${anchorName} ${dayKey}`,
                anchorName,
                anchorProfileId: anchor.id,
                startedAt: fields.paidAt || (o.orderTime ? new Date(o.orderTime) : new Date()),
                platform: 'xiaohongshu',
                status: 'completed',
                rawJson: JSON.stringify({ legacy: true, dayKey }),
              },
            })
            sessionId = created.id
            result.sessions += 1
          }
          sessionCache.set(sessionNo, sessionId)
        }

        const prior = await prisma.liveOrder.findUnique({
          where: { sessionId_orderNo: { sessionId, orderNo } },
        })
        if (prior) {
          result.skipped += 1
          continue
        }

        await prisma.liveOrder.create({
          data: {
            sessionId,
            orderNo,
            buyerName: fields.buyerName || null,
            productName: fields.productName || null,
            amount: fields.amount,
            validAmount: fields.validAmount,
            refundAmount: fields.refundAmount,
            afterSaleStatus: fields.afterSaleStatus || null,
            paidAt: fields.paidAt || (o.orderTime ? new Date(o.orderTime) : null),
            rawJson: fields.rawJson,
          },
        })
        result.orders += 1
        result.imported += 1
      } catch (err) {
        result.failed += 1
        result.errors.push(`Order ${o.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    for (const sessionId of new Set(sessionCache.values())) {
      await recalcSessionTotals(sessionId)
    }

    await finishImportBatch(batch.id, {
      status: result.failed > 0 && result.imported === 0 ? 'failed' : 'completed',
      importedCount: result.imported,
      errorMessage: result.errors.slice(0, 3).join('；') || undefined,
    })
  } catch (err) {
    await finishImportBatch(batch.id, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    result.errors.push(err instanceof Error ? err.message : String(err))
  } finally {
    db.close()
  }

  return result
}
