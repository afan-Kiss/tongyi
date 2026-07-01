import { exportRecordsCsv } from './accounting.service'
import type { AccountingRecordFilter } from './accounting.types'

export async function exportAccountingCsv(filter: AccountingRecordFilter) {
  return exportRecordsCsv(filter)
}
