export type AccountingRecordType = 'income' | 'expense' | 'cashback' | 'refund' | 'note'

export type AccountingStatus = 'pending' | 'handled' | 'ignored'

export interface AccountingRecordFilter {
  startDate?: string
  endDate?: string
  recordType?: AccountingRecordType | 'all'
  status?: AccountingStatus | 'all'
  externalOrderNo?: string
  logisticsNo?: string
  buyerPhone?: string
  page?: number
  pageSize?: number
}

export interface CreateAccountingRecordInput {
  recordType: AccountingRecordType
  businessType?: string
  amount: number
  occurredAt?: string
  summary?: string
  remark?: string
  paySource?: string
  externalOrderNo?: string
  logisticsNo?: string
  trackingNo?: string
  buyerName?: string
  buyerPhone?: string
  braceletCode?: string
  certNo?: string
  createFinanceAlert?: boolean
  createdBy?: string
}

export interface UpdateAccountingRecordInput {
  summary?: string
  remark?: string
  customerPaymentStatus?: AccountingStatus
  reimbursementStatus?: string
}

export interface AccountingSummary {
  period: string
  startDate: string
  endDate: string
  incomeTotal: number
  expenseTotal: number
  cashbackTotal: number
  refundTotal: number
  pendingCount: number
  handledCount: number
}
