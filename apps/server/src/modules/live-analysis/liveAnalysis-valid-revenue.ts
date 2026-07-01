/**
 * 有效成交订单池规则（自旧系统 valid-revenue-order.service.ts 迁入）
 * 有效成交金额 = 池内订单 effectiveGmvCent 之和，不是「支付 − 退款」简单相减。
 */

export interface ValidRevenueOrderInput {
  includedInGmv?: boolean
  effectiveGmvCent: number
  paymentBaseCent?: number
  orderStatusText?: string | null
  afterSaleStatusText?: string | null
  afterSaleStatusLabel?: string | null
  refundStatusText?: string | null
  productRefundAmountCent?: number
  returnAmountCent?: number
  realAfterSaleAmountCent?: number
  gmvExcludeReason?: string | null
  isReturnRefund?: boolean
  isReturnRefundOrder?: boolean
  isRealProductRefund?: boolean
  isReturned?: boolean
  orderId?: string
}

export interface ValidRevenueExplanation {
  valid: boolean
  reason: string
}

const VALID_ORDER_STATUS_RE = /已完成|已签收/

const AFTER_SALE_CANCEL_RE = /售后取消|买家取消售后|客户取消售后|售后已取消/

const EMPTY_AFTER_SALE_RE = /^(?:无售后|未售后|未申请售后|无退款)?$|^-$|^—$/

const EXCLUDED_AFTER_SALE_RE =
  /售后处理中|待商家收货|待买家退货|退款中|退货退款中|售后完成|退款成功|退款完成|退货退款成功|已退款|部分退款|仅退款|退货退款|售后成功|售后中|退货完成|已退货/

const AFTER_SALE_PROCESSING_RE = /售后处理中|待商家收货|待买家退货|退款中|退货退款中/

const AFTER_SALE_CLOSED_RE = /售后关闭|退款关闭|关闭.*无退款/

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim()
}

export function resolveAfterSaleStatusText(input: ValidRevenueOrderInput): string {
  return normalizeText(input.afterSaleStatusText || input.afterSaleStatusLabel)
}

function resolveRefundStatusText(input: ValidRevenueOrderInput): string {
  return normalizeText(input.refundStatusText)
}

export function resolveValidRevenueRefundAmountCent(input: ValidRevenueOrderInput): number {
  return Math.max(
    input.productRefundAmountCent ?? 0,
    input.returnAmountCent ?? 0,
    input.realAfterSaleAmountCent ?? 0,
  )
}

function hasValidRevenueOrderStatus(input: ValidRevenueOrderInput): boolean {
  const orderStatus = normalizeText(input.orderStatusText)
  if (!orderStatus) return false
  return VALID_ORDER_STATUS_RE.test(orderStatus)
}

function hasRefundActivityFlags(input: ValidRevenueOrderInput): boolean {
  return Boolean(
    input.isReturnRefund ||
      input.isReturnRefundOrder ||
      input.isRealProductRefund ||
      input.isReturned,
  )
}

function explainRefundBlocked(refundCent: number, input: ValidRevenueOrderInput): ValidRevenueExplanation {
  if (refundCent > 0 || hasRefundActivityFlags(input)) {
    return { valid: false, reason: '已退款/退款成功' }
  }
  return { valid: true, reason: '无售后，计入有效成交' }
}

function explainAfterSaleStatus(
  afterSaleStatus: string,
  refundCent: number,
  input: ValidRevenueOrderInput,
): ValidRevenueExplanation | null {
  if (!afterSaleStatus) return null

  if (AFTER_SALE_CANCEL_RE.test(afterSaleStatus)) {
    if (refundCent > 0) return { valid: false, reason: '售后已取消但存在退款金额' }
    return { valid: true, reason: '客户取消售后，计入有效成交' }
  }

  if (EMPTY_AFTER_SALE_RE.test(afterSaleStatus)) {
    return explainRefundBlocked(refundCent, input)
  }

  if (AFTER_SALE_PROCESSING_RE.test(afterSaleStatus)) {
    return { valid: false, reason: '售后处理中，货品可能正在退回' }
  }

  if (EXCLUDED_AFTER_SALE_RE.test(afterSaleStatus)) {
    return { valid: false, reason: '已退款/退款成功' }
  }

  if (AFTER_SALE_CLOSED_RE.test(afterSaleStatus)) {
    if (refundCent > 0) return { valid: false, reason: '售后关闭但存在退款金额' }
    return { valid: true, reason: '售后关闭且无退款，计入有效成交' }
  }

  return { valid: false, reason: `未知售后状态（${afterSaleStatus}），暂不计入` }
}

function explainRefundStatus(
  refundStatus: string,
  refundCent: number,
  input: ValidRevenueOrderInput,
): ValidRevenueExplanation | null {
  if (!refundStatus) return null

  if (AFTER_SALE_CANCEL_RE.test(refundStatus)) {
    if (refundCent > 0) return { valid: false, reason: '售后已取消但存在退款金额' }
    return { valid: true, reason: '客户取消售后，计入有效成交' }
  }

  if (AFTER_SALE_PROCESSING_RE.test(refundStatus)) {
    return { valid: false, reason: '售后处理中，货品可能正在退回' }
  }

  if (EXCLUDED_AFTER_SALE_RE.test(refundStatus)) {
    return { valid: false, reason: '已退款/退款成功' }
  }

  if (AFTER_SALE_CLOSED_RE.test(refundStatus)) {
    if (refundCent > 0) return { valid: false, reason: '售后关闭但存在退款金额' }
    return { valid: true, reason: '售后关闭且无退款，计入有效成交' }
  }

  if (/退款|退货|售后/.test(refundStatus)) {
    return { valid: false, reason: `未知售后状态（${refundStatus}），暂不计入` }
  }

  return null
}

export function explainValidRevenueOrder(input: ValidRevenueOrderInput): ValidRevenueExplanation {
  const included = input.includedInGmv !== false
  if (!included || input.effectiveGmvCent <= 0) {
    const excludeReason = normalizeText(input.gmvExcludeReason)
    if (excludeReason.includes('低价') || excludeReason.includes('刷单')) {
      return { valid: false, reason: '低价刷单订单，不计入有效成交' }
    }
    return { valid: false, reason: '订单未计入支付金额或成交金额为0' }
  }

  if (!hasValidRevenueOrderStatus(input)) {
    return { valid: false, reason: '订单状态不是已完成/已签收' }
  }

  const refundCent = resolveValidRevenueRefundAmountCent(input)
  const afterSaleStatus = resolveAfterSaleStatusText(input)
  const refundStatus = resolveRefundStatusText(input)

  const afterSaleExplain = explainAfterSaleStatus(afterSaleStatus, refundCent, input)
  if (afterSaleExplain) return afterSaleExplain

  const refundStatusExplain = explainRefundStatus(refundStatus, refundCent, input)
  if (refundStatusExplain) return refundStatusExplain

  const blocked = explainRefundBlocked(refundCent, input)
  if (!blocked.valid) return blocked

  return { valid: true, reason: '无售后，计入有效成交' }
}

export function isValidRevenueOrder(input: ValidRevenueOrderInput): boolean {
  return explainValidRevenueOrder(input).valid
}

export function resolveValidRevenueAmountCent(input: ValidRevenueOrderInput): number {
  return isValidRevenueOrder(input) ? input.effectiveGmvCent : 0
}

/** 元 → 分 */
export function yuanToCent(yuan: number): number {
  return Math.round(yuan * 100)
}

export function centToYuan(cent: number): number {
  return Math.round(cent) / 100
}

/** CSV/导入场景：从行数据构造 ValidRevenueOrderInput */
export function buildValidRevenueInputFromRow(row: {
  amount: number
  refundAmount?: number
  orderStatus?: string | null
  afterSaleStatus?: string | null
  refundStatus?: string | null
  includedInGmv?: boolean
  gmvExcludeReason?: string | null
}): ValidRevenueOrderInput {
  const paymentBaseCent = yuanToCent(row.amount)
  const refundCent = yuanToCent(row.refundAmount ?? 0)
  return {
    includedInGmv: row.includedInGmv ?? paymentBaseCent > 0,
    paymentBaseCent,
    effectiveGmvCent: Math.max(0, paymentBaseCent - refundCent),
    orderStatusText: row.orderStatus,
    afterSaleStatusText: row.afterSaleStatus,
    refundStatusText: row.refundStatus,
    productRefundAmountCent: refundCent,
    realAfterSaleAmountCent: refundCent,
    gmvExcludeReason: row.gmvExcludeReason,
  }
}

export function computeValidAmountYuan(
  amount: number,
  orderStatus: string,
  afterSaleStatus: string,
  refundAmount: number,
  refundStatus?: string,
): number {
  const input = buildValidRevenueInputFromRow({
    amount,
    refundAmount,
    orderStatus,
    afterSaleStatus,
    refundStatus,
  })
  return centToYuan(resolveValidRevenueAmountCent(input))
}

/** 售后同步回写 LiveOrder 时，按完整有效成交规则重算（非支付减退款） */
export function computeValidAmountAfterAfterSale(params: {
  amount: number
  refundAmount: number
  orderStatus?: string | null
  afterSaleStatus?: string | null
  refundStatus?: string | null
}): number {
  return computeValidAmountYuan(
    params.amount,
    String(params.orderStatus || '已完成').trim() || '已完成',
    String(params.afterSaleStatus || '').trim(),
    params.refundAmount,
    params.refundStatus ?? undefined,
  )
}
