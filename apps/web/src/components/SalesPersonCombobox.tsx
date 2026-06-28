import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props {
  value: string
  options: string[]
  disabled?: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => void
}

export const SalesPersonCombobox: React.FC<Props> = ({
  value,
  options,
  disabled,
  onChange,
  onCommit,
}) => {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (name: string) => {
    onChange(name)
    onCommit(name)
    setOpen(false)
  }

  const list = options.filter(Boolean)

  return (
    <div ref={rootRef} className="relative">
      <div className="flex gap-1">
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-300"
          placeholder="如：飞云、子杰"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            window.setTimeout(() => {
              if (!rootRef.current?.contains(document.activeElement)) {
                onCommit(value)
                setOpen(false)
              }
            }, 120)
          }}
          onFocus={() => {
            if (list.length) setOpen(true)
          }}
        />
        <button
          type="button"
          disabled={disabled || list.length === 0}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 px-2.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          aria-label="选择历史销售人员"
        >
          <ChevronDown size={16} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>
      </div>
      {open && list.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {list.map((name) => (
            <li key={name}>
              <button
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-rose-50 ${
                  name === value ? 'bg-rose-50/80 font-medium text-rose-800' : 'text-slate-700'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(name)
                }}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
