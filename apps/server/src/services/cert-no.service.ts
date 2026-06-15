import { fetchNextCertNoFromExcel } from '../adapters/excel/excel-live.adapter'
import { getDefaultCertPrefix } from '../config/env'
import {
  defaultDigitWidth,
  formatCertNo,
  parseCertNoParts,
} from '../domain/cert-no.rules'
import { braceletRepo } from '../repositories/bracelet.repository'

function maxCertInList(certNos: string[], prefix: string): { maxNum: number; width: number } {
  let maxNum = 0
  let width = defaultDigitWidth(prefix)
  for (const raw of certNos) {
    const parsed = parseCertNoParts(raw)
    if (!parsed || parsed.prefix !== prefix) continue
    maxNum = Math.max(maxNum, parsed.num)
    width = Math.max(width, parsed.width)
  }
  return { maxNum, width }
}

export async function allocateNextCertNo(prefixInput?: string): Promise<{
  certNo: string
  prefix: string
  source: 'excel' | 'database' | 'default'
}> {
  const prefix = (prefixInput || getDefaultCertPrefix()).trim().toUpperCase()
  if (!prefix) throw new Error('编号前缀无效')

  const excel = await fetchNextCertNoFromExcel(prefix)
  const dbCerts = (await braceletRepo.listCertNos()).map((r) => r.certNo)
  const dbMax = maxCertInList(dbCerts, prefix)

  const excelMax = excel.ok && excel.excelMax != null ? excel.excelMax : excel.ok && excel.nextNum ? excel.nextNum - 1 : 0
  let width = Math.max(
    defaultDigitWidth(prefix),
    dbMax.width,
    excel.width ?? defaultDigitWidth(prefix),
  )

  const combinedMax = Math.max(excelMax, dbMax.maxNum)
  let nextNum = combinedMax > 0 ? combinedMax + 1 : 1

  let source: 'excel' | 'database' | 'default' = 'default'
  if (combinedMax > 0) {
    source = dbMax.maxNum >= excelMax ? 'database' : 'excel'
  } else if (excel.ok) {
    source = 'excel'
  }

  let certNo = formatCertNo(prefix, nextNum, width)
  while (await braceletRepo.findByCert(certNo)) {
    nextNum += 1
    certNo = formatCertNo(prefix, nextNum, width)
  }

  return { certNo, prefix, source }
}
