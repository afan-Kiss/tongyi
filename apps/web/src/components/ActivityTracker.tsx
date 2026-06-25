import React, { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { flushActivityQueue, trackActivity } from '@/lib/userActivity'
import { pathToPageLabel } from '@/lib/activityDisplay'

export const ActivityTracker: React.FC = () => {
  const location = useLocation()
  const prevPathRef = useRef('')
  const enterTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    const path = `${location.pathname}${location.search}`
    const now = Date.now()
    if (prevPathRef.current && prevPathRef.current !== path) {
      const durationMs = now - enterTimeRef.current
      if (durationMs >= 500) {
        trackActivity({
          category: 'navigation',
          action: 'page_stay',
          path: prevPathRef.current,
          detail: {
            durationMs,
            page: pathToPageLabel(prevPathRef.current),
          },
        })
      }
    }
    if (path === prevPathRef.current) return
    prevPathRef.current = path
    enterTimeRef.current = now
    trackActivity({
      category: 'navigation',
      action: 'page_view',
      path,
      detail: {
        page: pathToPageLabel(path),
        pathname: location.pathname,
        search: location.search,
      },
    })
  }, [location.pathname, location.search])

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-no-audit]')) return

      const el = target.closest(
        'button, a, [role="button"], input[type="submit"], input[type="button"], label[for]',
      ) as HTMLElement | null
      if (!el) return

      const tag = el.tagName.toLowerCase()
      const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      const href = tag === 'a' ? (el as HTMLAnchorElement).href : undefined
      const inputType = tag === 'input' ? (el as HTMLInputElement).type : undefined

      trackActivity({
        category: 'click',
        action: `${tag}_click`,
        path: `${window.location.pathname}${window.location.search}`,
        detail: {
          tag,
          text: text || undefined,
          href,
          inputType,
          id: el.id || undefined,
          name: (el as HTMLInputElement).name || undefined,
        },
      })
    }

    document.addEventListener('click', onClick, true)
    const onUnload = () => {
      const path = prevPathRef.current
      if (path) {
        const durationMs = Date.now() - enterTimeRef.current
        if (durationMs >= 500) {
          trackActivity({
            category: 'navigation',
            action: 'page_stay',
            path,
            detail: { durationMs, page: pathToPageLabel(path) },
          })
        }
      }
      void flushActivityQueue()
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onUnload)
      void flushActivityQueue()
    }
  }, [])

  return null
}
