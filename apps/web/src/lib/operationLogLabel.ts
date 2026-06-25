/** 操作日志 opType → 中文（总览/列表展示） */
const OP_TYPE_LABELS: Record<string, string> = {
  outbound: '出库',
  inbound: '入库',
  register: '登记',
  new_inbound: '新品入库',
  update: '编辑',
}

export function formatOpTypeLabel(opType: string): string {
  const key = (opType || '').trim()
  return OP_TYPE_LABELS[key] || '操作'
}

/** 优先用服务端 opLabel，否则按 opType 转中文 */
export function displayOperationLabel(log: { opType: string; opLabel?: string | null }): string {
  const label = (log.opLabel || '').trim()
  if (label && label !== log.opType && !/^[a-z][a-z0-9_]*$/i.test(label)) {
    return label
  }
  return formatOpTypeLabel(log.opType)
}

export function displayOperationDetail(log: {
  opType: string
  opLabel?: string | null
  detail?: string | null
}): string {
  const detail = (log.detail || '').trim()
  if (detail && detail !== log.opType && !/^[a-z][a-z0-9_]*$/i.test(detail)) {
    return detail
  }
  return displayOperationLabel(log)
}
