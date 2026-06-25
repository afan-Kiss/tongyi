import type { RefObject } from 'react'

/** 扫码框自动聚焦：不抢走出库表单等输入框的焦点 */
export function scheduleScanRefocus(
  inputRef: RefObject<HTMLInputElement | null>,
  delayMs = 50,
): void {
  window.setTimeout(() => {
    const active = document.activeElement as HTMLElement | null
    if (active?.closest('[data-no-scan-refocus]')) return
    if (active && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(active.tagName)) return
    inputRef.current?.focus()
  }, delayMs)
}
