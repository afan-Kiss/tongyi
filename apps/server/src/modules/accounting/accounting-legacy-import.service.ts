import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '../../lib/prisma'
import { MONOREPO_ROOT, SERVER_ROOT } from '../../config/env'
import { openLegacyDatabase, resolveLegacyAccountingDbPath, tableExists } from '../../lib/legacy-sqlite'
import { createFinanceAlertForAccounting } from './accounting-finance-bridge'

export interface LegacyImportResult {
  imported: number
  skipped: number
  failed: number
  alertsCreated: number
  errors: string[]
  dbPath: string
}

interface LegacyExpenseRow {
  id: number
  expenseNo: string
  expenseType: string
  businessType: string | null
  amount: number
  occurredAt: string
  expenseSummary: string | null
  remark: string | null
  paySource: string | null
  externalOrderNo: string | null
  logisticsNo: string | null
  reimbursementStatus: string
  customerPaymentStatus: string | null
  braceletCode: string | null
  isVoided: number
  isTrialRun: number
  saleOrderNo: string | null
  saleLogisticsNo: string | null
  customerName: string | null
}

const CASHBACK_BUSINESS = new Set(['customer_refund', 'customer_compensation', 'after_sale_compensation'])
const CASHBACK_EXPENSE_KEYWORDS = /返款|退差价|返现|补偿|安抚|运费补偿/
const REFUND_EXPENSE_KEYWORDS = /^退款|销售退款/
const NOTE_BUSINESS = new Set(['manual_pending'])

function decimalToNumber(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function mapLegacyExpenseToRecordType(expense: LegacyExpenseRow): 'expense' | 'cashback' | 'refund' | 'note' {
  const bt = String(expense.businessType || '').trim()
  const et = String(expense.expenseType || '').trim()

  if (REFUND_EXPENSE_KEYWORDS.test(et)) return 'refund'
  if (CASHBACK_BUSINESS.has(bt) || CASHBACK_EXPENSE_KEYWORDS.test(et)) return 'cashback'
  if (NOTE_BUSINESS.has(bt) && !expense.externalOrderNo && !expense.saleOrderNo) return 'note'
  return 'expense'
}

function mapPaymentStatus(expense: LegacyExpenseRow): string {
  const cps = String(expense.customerPaymentStatus || '').trim()
  if (cps === 'paid') return 'handled'
  if (cps === 'failed') return 'ignored'
  if (expense.reimbursementStatus === 'reimbursed') return 'handled'
  return 'pending'
}

function resolveLegacyUploadsDir(dbPath: string): string {
  const serverRoot = path.dirname(path.dirname(dbPath))
  const candidates = [
    path.join(serverRoot, 'uploads'),
    path.join(serverRoot, 'data', 'uploads'),
    path.join(serverRoot, '..', 'uploads'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0]
}

export async function runLegacyAccountingImport(options?: {
  dbPath?: string
  copyAttachments?: boolean
  createAlerts?: boolean
}): Promise<LegacyImportResult> {
  const dbPath = resolveLegacyAccountingDbPath(options?.dbPath)
  const result: LegacyImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    alertsCreated: 0,
    errors: [],
    dbPath,
  }

  if (!fs.existsSync(dbPath)) {
    result.errors.push(`旧记账库不存在：${dbPath}。请确认路径或设置 LEGACY_ACCOUNTING_DB。`)
    return result
  }

  const db = openLegacyDatabase(dbPath, true)
  try {
    if (!tableExists(db, 'Expense')) {
      result.errors.push('旧库中没有 Expense 表，无法导入。')
      return result
    }

    const rows = db
      .prepare(
        `SELECT e.id, e.expenseNo, e.expenseType, e.businessType, e.amount, e.occurredAt,
                e.expenseSummary, e.remark, e.paySource, e.externalOrderNo, e.logisticsNo,
                e.reimbursementStatus, e.customerPaymentStatus, e.braceletCode, e.isVoided, e.isTrialRun,
                s.externalOrderNo AS saleOrderNo, s.logisticsNo AS saleLogisticsNo, s.customerName
         FROM Expense e
         LEFT JOIN Sale s ON e.saleId = s.id
         WHERE e.isVoided = 0 AND e.isTrialRun = 0
         ORDER BY e.id ASC`,
      )
      .all() as LegacyExpenseRow[]

    const uploadsDir = resolveLegacyUploadsDir(dbPath)
    const tongyiMedia = path.join(SERVER_ROOT, 'data', 'accounting-legacy')
    if (options?.copyAttachments) {
      fs.mkdirSync(tongyiMedia, { recursive: true })
    }

    for (const row of rows) {
      try {
        const existing = await prisma.accountingRecord.findFirst({
          where: { legacyExpenseId: row.id },
        })
        if (existing) {
          result.skipped += 1
          continue
        }

        const recordType = mapLegacyExpenseToRecordType(row)
        const externalOrderNo = (row.externalOrderNo || row.saleOrderNo || '').trim() || null
        const logisticsNo = (row.logisticsNo || row.saleLogisticsNo || '').trim() || null
        const amount = decimalToNumber(row.amount)
        if (amount <= 0) {
          result.skipped += 1
          continue
        }

        const record = await prisma.accountingRecord.create({
          data: {
            recordNo: row.expenseNo || `LEG-EXP-${row.id}`,
            recordType,
            businessType: row.businessType || 'normal',
            amount,
            occurredAt: new Date(row.occurredAt),
            summary: row.expenseSummary?.trim() || null,
            remark: row.remark?.trim() || null,
            paySource: row.paySource?.trim() || null,
            externalOrderNo,
            logisticsNo,
            trackingNo: logisticsNo,
            buyerName: row.customerName?.trim() || null,
            braceletCode: row.braceletCode?.trim() || null,
            reimbursementStatus: row.reimbursementStatus || 'pending',
            customerPaymentStatus: mapPaymentStatus(row),
            legacyExpenseId: row.id,
          },
        })

        if (tableExists(db, 'ExpenseAttachment')) {
          const attachments = db
            .prepare(
              `SELECT ea.id, f.localPath, f.originalName, f.mimeType, f.fileSize
               FROM ExpenseAttachment ea
               JOIN File f ON ea.fileId = f.id
               WHERE ea.expenseId = ?`,
            )
            .all(row.id) as Array<{
            localPath: string
            originalName: string | null
            mimeType: string | null
            fileSize: number
          }>

          for (const att of attachments) {
            let localPath = att.localPath
            if (!path.isAbsolute(localPath)) {
              localPath = path.join(uploadsDir, localPath)
            }
            let storedPath = localPath
            if (options?.copyAttachments && fs.existsSync(localPath)) {
              const dest = path.join(tongyiMedia, `${record.id}-${path.basename(localPath)}`)
              fs.copyFileSync(localPath, dest)
              storedPath = dest
            }
            await prisma.accountingAttachment.create({
              data: {
                recordId: record.id,
                filename: att.originalName || path.basename(localPath),
                localPath: storedPath,
                mimeType: att.mimeType,
                sizeBytes: att.fileSize || 0,
              },
            })
          }
        }

        const shouldAlert =
          (options?.createAlerts !== false) &&
          ['expense', 'cashback', 'refund'].includes(recordType) &&
          Boolean(externalOrderNo || logisticsNo) &&
          mapPaymentStatus(row) === 'pending'

        if (shouldAlert) {
          const alert = await createFinanceAlertForAccounting(record)
          if (alert) result.alertsCreated += 1
        }

        result.imported += 1
      } catch (err) {
        result.failed += 1
        result.errors.push(`Expense#${row.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (tableExists(db, 'Refund')) {
      const refunds = db
        .prepare(
          `SELECT r.id, r.refundAmount, r.refundReason, r.refundedAt, r.braceletCode,
                  s.externalOrderNo, s.logisticsNo, s.customerName
           FROM Refund r
           LEFT JOIN Sale s ON r.saleId = s.id
           ORDER BY r.id ASC`,
        )
        .all() as Array<{
        id: number
        refundAmount: number
        refundReason: string | null
        refundedAt: string
        braceletCode: string
        externalOrderNo: string | null
        logisticsNo: string | null
        customerName: string | null
      }>

      for (const rf of refunds) {
        const recordNo = `LEG-REF-${rf.id}`
        try {
          const dup = await prisma.accountingRecord.findUnique({ where: { recordNo } })
          if (dup) {
            result.skipped += 1
            continue
          }
          const amount = decimalToNumber(rf.refundAmount)
          if (amount <= 0) {
            result.skipped += 1
            continue
          }
          const record = await prisma.accountingRecord.create({
            data: {
              recordNo,
              recordType: 'refund',
              businessType: 'customer_refund',
              amount,
              occurredAt: new Date(rf.refundedAt),
              summary: rf.refundReason?.trim() || '销售退款',
              externalOrderNo: rf.externalOrderNo?.trim() || null,
              logisticsNo: rf.logisticsNo?.trim() || null,
              trackingNo: rf.logisticsNo?.trim() || null,
              buyerName: rf.customerName?.trim() || null,
              braceletCode: rf.braceletCode?.trim() || null,
              customerPaymentStatus: 'pending',
              remark: `legacyRefundId=${rf.id}`,
            },
          })
          if (rf.externalOrderNo || rf.logisticsNo) {
            const alert = await createFinanceAlertForAccounting(record)
            if (alert) result.alertsCreated += 1
          }
          result.imported += 1
        } catch (err) {
          result.failed += 1
          result.errors.push(`Refund#${rf.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
  } finally {
    db.close()
  }

  return result
}
