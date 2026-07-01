export type HandleStatus = 'pending' | 'handled' | 'ignored'

export interface AfterSaleListQuery {
  shopId?: string
  page?: number
  pageSize?: number
  handleStatus?: HandleStatus
}

export interface AfterSaleOverview {
  totalItems: number
  pendingToday: number
  refundCount: number
  pendingRefundAmount: number
  financePendingCount: number
  hint: string
}
