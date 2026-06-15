import type { ExcelRowData } from '../adapters/excel/excel-live.adapter'
import { fetchExcelRowData } from '../adapters/excel/excel-live.adapter'
import { normalizeCertNo } from '../domain/inventory.rules'
import { braceletRepo } from '../repositories/bracelet.repository'

function toBraceletData(row: ExcelRowData) {
  return {
    certNo: normalizeCertNo(row.certNo),
    arrivalDate: row.arrivalDate || null,
    batch: row.batch || null,
    qty: row.qty === 0 ? 0 : 1,
    category: row.category || null,
    ringSize: row.ringSize || null,
    cost: row.cost || null,
    remark: row.remark || null,
    orderNo: row.orderNo || null,
    returnDate: row.returnDate || null,
    soldDate: row.soldDate || null,
    actualPrice: row.actualPrice || null,
    salesPerson: row.salesPerson || null,
    salesChannel: row.salesChannel || null,
    excelRow: row.excelRow ?? null,
    excelSheet: row.excelSheet ?? null,
  }
}

/** 数据库无记录时，从已打开的 Excel 补同步一行。 */
export async function upsertBraceletFromExcel(certNo: string) {
  const code = normalizeCertNo(certNo)
  const existing = await braceletRepo.findByCert(code)
  if (existing) return existing

  const excel = await fetchExcelRowData(code)
  if (!excel.ok || !excel.data) return null

  const data = toBraceletData(excel.data)
  await braceletRepo.create(data)
  return braceletRepo.findByCert(code)
}
