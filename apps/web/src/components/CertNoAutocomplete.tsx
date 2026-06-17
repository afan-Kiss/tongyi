import React, { useCallback, useEffect, useId, useRef, useState } from 'react'

import { excelApi } from '@/api/endpoints'
import type { CertIndexEntry } from '@/api/types'
import { certMatchesSearchQuery } from '@/lib/certSearch'

type Props = {
  value: string
  onChange: (value: string) => void
  onSelect?: (entry: CertIndexEntry) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export const CertNoAutocomplete: React.FC<Props> = ({
  value,
  onChange,
  onSelect,
  onBlur,
  placeholder,
  className,
  disabled,
}) => {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<CertIndexEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickedRef = useRef(false)

  const search = useCallback(async (q: string) => {
    const query = q.trim()
    if (!query) {
      setItems([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const r = await excelApi.searchCertIndex(query, 15)
      const hits = r.data.items.filter((item) => certMatchesSearchQuery(item.certNo, query))
      setItems(hits)
      setOpen(hits.length > 0)
      setActiveIdx(hits.length > 0 ? 0 : -1)
    } catch {
      setItems([])
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void search(value)
    }, 120)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value, search])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const pick = (entry: CertIndexEntry) => {
    pickedRef.current = true
    onChange(entry.certNo)
    setOpen(false)
    onSelect?.(entry)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      pick(items[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        className={className}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (items.length > 0) setOpen(true)
        }}
        onBlur={() => {
          if (pickedRef.current) {
            pickedRef.current = false
            return
          }
          onBlur?.()
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item, idx) => (
            <li
              key={`${item.certNo}-${item.sheet}-${item.row}`}
              role="option"
              aria-selected={idx === activeIdx}
              className={`cursor-pointer px-3 py-2.5 text-sm touch-manipulation ${
                idx === activeIdx ? 'bg-rose-50 text-rose-900' : 'text-slate-800 hover:bg-slate-50'
              }`}
              onPointerDown={(e) => {
                e.preventDefault()
                pick(item)
              }}
            >
              <div className="font-semibold tracking-wider">{item.certNo}</div>
              <div className="text-[11px] text-slate-400">
                {[item.batch, item.category, item.sheet ? `表 ${item.sheet}` : '']
                  .filter(Boolean)
                  .join(' · ') || `行 ${item.row}`}
              </div>
            </li>
          ))}
          {loading && <li className="px-3 py-2 text-[11px] text-slate-400">搜索中…</li>}
        </ul>
      )}
    </div>
  )
}
