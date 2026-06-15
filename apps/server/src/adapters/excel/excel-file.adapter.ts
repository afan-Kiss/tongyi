import ExcelJS from 'exceljs'
import { prisma } from '../../lib/prisma'
import { normalizeCertNo } from '../../domain/inventory.rules'
import { fromExcelRow } from '../../domain/excel-fields'

const HEADERS = [
  '到货日期', '批次', '数量', '编号', '品类', '圈口', '成本', '备注',
  '订单号', '退货日期', '售出日期', '实际售价', '销售人员', '销售渠道',
]

export async function exportWorkbook(): Promise<Buffer> {
  const items = await prisma.bracelet.findMany({ orderBy: { certNo: 'asc' } })
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('库存')
  ws.addRow(HEADERS)
  for (const b of items) {
    ws.addRow([
      b.arrivalDate, b.batch, b.qty, b.certNo, b.category, b.ringSize, b.cost, b.remark,
      b.orderNo, b.returnDate, b.soldDate, b.actualPrice, b.salesPerson, b.salesChannel,
    ])
  }
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

export async function importWorkbook(buffer: Buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  const ws = wb.worksheets[0]
  if (!ws) return { imported: 0, updated: 0, errors: ['Excel 无工作表'] as string[] }

  let imported = 0
  let updated = 0
  const errors: string[] = []
  const tasks: Promise<void>[] = []

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const certNo = normalizeCertNo(String(row.getCell(4).value || ''))
    if (!certNo) return
    const data = fromExcelRow({
      arrivalDate: String(row.getCell(1).value || ''),
      batch: String(row.getCell(2).value || ''),
      qty: Number(row.getCell(3).value) === 0 ? 0 : 1,
      certNo,
      category: String(row.getCell(5).value || ''),
      ringSize: String(row.getCell(6).value || ''),
      cost: String(row.getCell(7).value || ''),
      remark: String(row.getCell(8).value || ''),
      orderNo: String(row.getCell(9).value || ''),
      returnDate: String(row.getCell(10).value || ''),
      soldDate: String(row.getCell(11).value || ''),
      actualPrice: String(row.getCell(12).value || ''),
      salesPerson: String(row.getCell(13).value || ''),
      salesChannel: String(row.getCell(14).value || ''),
      excelRow: rowNumber,
      excelSheet: ws.name,
    })
    tasks.push(
      prisma.bracelet
        .upsert({ where: { certNo }, create: data, update: data })
        .then((r) => { if (r.createdAt.getTime() === r.updatedAt.getTime()) imported++; else updated++ })
        .catch((e) => errors.push(`${certNo}: ${e instanceof Error ? e.message : String(e)}`))
        .then(() => undefined),
    )
  })
  await Promise.all(tasks)
  return { imported, updated, errors }
}
