import { prisma } from '../../lib/prisma'
import {
  createImportBatch,
  finishImportBatch,
  recalcSessionTotals,
  upsertAnchorProfile,
} from './liveAnalysis.repository'
import { computeValidAmountYuan } from './liveAnalysis-valid-revenue'

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
      continue
    }
    if (ch === ',' && !inQuote) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function num(v: string | undefined) {
  const n = Number(String(v || '').replace(/[,，¥]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseDate(v: string | undefined) {
  const s = String(v || '').trim()
  if (!s) return new Date()
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

/** @deprecated 使用 liveAnalysis-valid-revenue.ts */
export { computeValidAmountYuan as computeValidAmount } from './liveAnalysis-valid-revenue'

export async function importCsvContent(content: string, filename?: string) {
  const batch = await createImportBatch({ source: 'csv', filename })
  try {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) {
      throw new Error('CSV 至少需要表头一行和数据一行')
    }
    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
    const col = (name: string, aliases: string[]) => {
      for (const a of [name, ...aliases]) {
        const i = header.indexOf(a.toLowerCase())
        if (i >= 0) return i
      }
      return -1
    }
    const idx = {
      sessionNo: col('sessionno', ['session_no', '场次号', '直播场次']),
      title: col('title', ['场次名称', '直播标题']),
      anchorName: col('anchorname', ['anchor_name', '主播', '主播名']),
      startedAt: col('startedat', ['start_at', '开播时间', '开始时间']),
      endedAt: col('endedat', ['end_at', '下播时间', '结束时间']),
      orderNo: col('orderno', ['order_no', '订单号']),
      buyerName: col('buyername', ['buyer_name', '买家']),
      productName: col('productname', ['product_name', '商品', '商品名称']),
      skuName: col('skuname', ['sku_name', '规格']),
      amount: col('amount', ['支付金额', 'gmv', '成交额']),
      validAmount: col('validamount', ['valid_amount', '有效成交']),
      refundAmount: col('refundamount', ['refund_amount', '退款金额', '退款']),
      afterSaleStatus: col('aftersalestatus', ['after_sale_status', '售后状态']),
      orderStatus: col('orderstatus', ['order_status', '订单状态']),
      paidAt: col('paidat', ['paid_at', '支付时间']),
    }
    if (idx.anchorName < 0) {
      throw new Error('CSV 缺少「主播/anchorName」列')
    }

    let imported = 0
    const sessionCache = new Map<string, string>()

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i])
      if (!cells.some((c) => c)) continue
      const anchorName = cells[idx.anchorName] || '未命名主播'
      const sessionNo =
        (idx.sessionNo >= 0 ? cells[idx.sessionNo] : '') ||
        `${anchorName}-${cells[idx.startedAt >= 0 ? idx.startedAt : 0] || i}`
      let sessionId = sessionCache.get(sessionNo)
      if (!sessionId) {
        const anchor = await upsertAnchorProfile(anchorName)
        const startedAt = parseDate(idx.startedAt >= 0 ? cells[idx.startedAt] : undefined)
        const session = await prisma.liveSession.upsert({
          where: { sessionNo },
          create: {
            sessionNo,
            title: idx.title >= 0 ? cells[idx.title] || null : null,
            anchorName,
            anchorProfileId: anchor.id,
            startedAt,
            endedAt: idx.endedAt >= 0 && cells[idx.endedAt] ? parseDate(cells[idx.endedAt]) : null,
            platform: 'xiaohongshu',
            status: 'completed',
          },
          update: {
            anchorName,
            anchorProfileId: anchor.id,
            title: idx.title >= 0 ? cells[idx.title] || undefined : undefined,
          },
        })
        sessionId = session.id
        sessionCache.set(sessionNo, sessionId)
      }

      if (idx.orderNo >= 0 && cells[idx.orderNo]) {
        const amount = num(idx.amount >= 0 ? cells[idx.amount] : '0')
        const refundAmount = num(idx.refundAmount >= 0 ? cells[idx.refundAmount] : '0')
        const afterSaleStatus = idx.afterSaleStatus >= 0 ? cells[idx.afterSaleStatus] : ''
        const orderStatus = idx.orderStatus >= 0 ? cells[idx.orderStatus] : '已完成'
        const validAmount =
          idx.validAmount >= 0 && cells[idx.validAmount]
            ? num(cells[idx.validAmount])
            : computeValidAmountYuan(amount, orderStatus, afterSaleStatus, refundAmount)
        await prisma.liveOrder.upsert({
          where: { sessionId_orderNo: { sessionId, orderNo: cells[idx.orderNo] } },
          create: {
            sessionId,
            orderNo: cells[idx.orderNo],
            buyerName: idx.buyerName >= 0 ? cells[idx.buyerName] || null : null,
            productName: idx.productName >= 0 ? cells[idx.productName] || null : null,
            skuName: idx.skuName >= 0 ? cells[idx.skuName] || null : null,
            amount,
            validAmount,
            refundAmount,
            afterSaleStatus: afterSaleStatus || null,
            paidAt: idx.paidAt >= 0 && cells[idx.paidAt] ? parseDate(cells[idx.paidAt]) : null,
            rawJson: JSON.stringify({ row: i, orderStatus }),
          },
          update: {
            amount,
            validAmount,
            refundAmount,
            afterSaleStatus: afterSaleStatus || null,
          },
        })
      }
      imported += 1
    }

    for (const sessionId of sessionCache.values()) {
      await recalcSessionTotals(sessionId)
    }

    await finishImportBatch(batch.id, { status: 'completed', importedCount: imported })
    return { batchId: batch.id, imported, message: `已导入 ${imported} 行` }
  } catch (err) {
    const message = err instanceof Error ? err.message : '导入失败'
    await finishImportBatch(batch.id, { status: 'failed', errorMessage: message })
    throw new Error(message)
  }
}

export async function importExcelPlaceholder(filename?: string) {
  const batch = await createImportBatch({ source: 'excel', filename })
  await finishImportBatch(batch.id, {
    status: 'unsupported',
    importedCount: 0,
    errorMessage: 'Excel 完整解析将在小红书订单 Excel 迁移后开放，请先使用 CSV 或旧系统备份入口。',
  })
  return {
    batchId: batch.id,
    imported: 0,
    message: 'Excel 导入功能迁移中，已记录批次。请先用 CSV 或打开旧主播分析系统。',
  }
}
