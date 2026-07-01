export interface LiveAnalysisPeriodFilter {
  startDate?: string
  endDate?: string
  period?: 'today' | 'week' | 'month' | 'custom'
}

export interface LiveSessionFilter extends LiveAnalysisPeriodFilter {
  anchorName?: string
  page?: number
  pageSize?: number
}

export interface LiveAnalysisSummary {
  period: string
  startDate: string
  endDate: string
  grossSalesAmount: number
  validSalesAmount: number
  orderCount: number
  refundAmount: number
  refundCount: number
  afterSaleAmount: number
  sessionCount: number
  anchorCount: number
  /** 大白话口径说明 */
  caliberNotes: {
    grossSalesAmount: string
    validSalesAmount: string
    refundAmount: string
    orderCount: string
  }
}

export interface AnchorRankingRow {
  rank: number
  anchorName: string
  displayName?: string | null
  validSalesAmount: number
  grossSalesAmount: number
  orderCount: number
  sessionCount: number
  refundAmount: number
  refundRate: number | null
  plainSummary: string
}

export interface RefundAnalysisRow {
  orderNo: string
  sessionNo: string
  anchorName: string
  productName?: string | null
  amount: number
  refundAmount: number
  afterSaleStatus?: string | null
  paidAt?: string | null
  plainSummary: string
}

export interface ProductAnalysisRow {
  productName: string
  orderCount: number
  grossAmount: number
  validAmount: number
  refundAmount: number
  refundRate: number | null
  plainSummary: string
}

export interface LiveSuggestion {
  id: string
  type: string
  priority: 'high' | 'medium' | 'low'
  title: string
  message: string
  action: string
  anchorName?: string
  productName?: string
}

export interface ImportLiveDataInput {
  content: string
  filename?: string
  format?: 'csv' | 'excel'
}
