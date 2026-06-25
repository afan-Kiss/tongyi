/**
 * Excel 可写字段定义 — 与辅助出库软件 config.py 列映射一致
 * 图片、扩展详情等不在此列，仅存 SQLite
 */

export const EXCEL_COLUMN_MAP = {
  arrivalDate: { col: 'A', label: '到货日期' },
  batch: { col: 'B', label: '批次' },
  qty: { col: 'C', label: '数量' },
  certNo: { col: 'D', label: '编号' },
  category: { col: 'E', label: '品类' },
  ringSize: { col: 'F', label: '圈口' },
  cost: { col: 'G', label: '成本' },
  remark: { col: 'H', label: '备注' },
  orderNo: { col: 'I', label: '订单号' },
  returnDate: { col: 'J', label: '退货日期' },
  soldDate: { col: 'K', label: '售出日期' },
  actualPrice: { col: 'L', label: '实际售价' },
  salesPerson: { col: 'M', label: '销售人员' },
  salesChannel: { col: 'N', label: '销售渠道' },
} as const

export type ExcelFieldKey = keyof typeof EXCEL_COLUMN_MAP

/** 出库时传给 Excel 桥接的最小 payload */
export function toExcelOutboundPayload(bracelet: {
  certNo: string
  excelRow?: number | null
  excelSheet?: string | null
}, ops: {
  price: number
  remark: string
  fullRemark?: string
  salesPerson: string
  salesChannel: string
  orderNo: string
}) {
  return {
    certNo: bracelet.certNo,
    price: ops.price,
    remark: ops.remark,
    fullRemark: ops.fullRemark,
    salesPerson: ops.salesPerson,
    salesChannel: ops.salesChannel,
    orderNo: ops.orderNo,
    excelRow: bracelet.excelRow,
    excelSheet: bracelet.excelSheet,
  }
}

/** 入库时传给 Excel 桥接的最小 payload */
export function toExcelInboundPayload(
  bracelet: {
    certNo: string
    excelRow?: number | null
    excelSheet?: string | null
  },
  remark: string,
  fullRemark?: string,
  opts?: { recoveryOnly?: boolean },
) {
  const recoveryOnly = opts?.recoveryOnly ?? false
  return {
    certNo: bracelet.certNo,
    remark,
    fullRemark: recoveryOnly ? undefined : (fullRemark ?? remark),
    recoveryOnly,
    excelRow: bracelet.excelRow,
    excelSheet: bracelet.excelSheet,
  }
}

/** 新品入库时传给 Excel 桥接 — 仅 A-H 基础列 */
export function toExcelNewInboundPayload(bracelet: {
  certNo: string
  arrivalDate?: string | null
  batch?: string | null
  category?: string | null
  ringSize?: string | null
  cost?: string | null
  remark?: string | null
}) {
  return {
    certNo: bracelet.certNo,
    arrivalDate: bracelet.arrivalDate,
    batch: bracelet.batch,
    category: bracelet.category,
    ringSize: bracelet.ringSize,
    cost: bracelet.cost,
    remark: bracelet.remark,
  }
}

/** Excel 导入行 → Bracelet 基础字段（不含 detail/media） */
export function fromExcelRow(row: {
  arrivalDate: string
  batch: string
  qty: number
  certNo: string
  category: string
  ringSize: string
  cost: string
  remark: string
  orderNo: string
  returnDate: string
  soldDate: string
  actualPrice: string
  salesPerson: string
  salesChannel: string
  excelRow: number
  excelSheet: string
}) {
  return {
    arrivalDate: row.arrivalDate,
    batch: row.batch,
    qty: row.qty,
    certNo: row.certNo,
    category: row.category,
    ringSize: row.ringSize,
    cost: row.cost,
    remark: row.remark,
    orderNo: row.orderNo,
    returnDate: row.returnDate,
    soldDate: row.soldDate,
    actualPrice: row.actualPrice,
    salesPerson: row.salesPerson,
    salesChannel: row.salesChannel,
    excelRow: row.excelRow,
    excelSheet: row.excelSheet,
  }
}
