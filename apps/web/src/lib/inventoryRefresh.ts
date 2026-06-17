/** 库存列表等页面删除/更新后刷新 */
export const INVENTORY_REFRESH_EVENT = 'jade-inventory-refresh'

export function emitInventoryRefresh(): void {
  window.dispatchEvent(new CustomEvent(INVENTORY_REFRESH_EVENT))
}

export function onInventoryRefresh(listener: () => void): () => void {
  window.addEventListener(INVENTORY_REFRESH_EVENT, listener)
  return () => window.removeEventListener(INVENTORY_REFRESH_EVENT, listener)
}
