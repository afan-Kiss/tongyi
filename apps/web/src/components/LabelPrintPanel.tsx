import React, { useState } from 'react'

import type { Bracelet } from '@/api/types'

import { printBraceletTag } from '@/lib/printBraceletTag'

interface Props {
  bracelet: Bracelet
  /** 按钮文案，默认「打印吊牌」 */
  label?: string
}

export const LabelPrintPanel: React.FC<Props> = ({ bracelet, label = '打印吊牌' }) => {
  const [status, setStatus] = useState('')
  const [printing, setPrinting] = useState(false)

  const onPrint = async () => {
    setPrinting(true)
    setStatus('正在发送到标签机…')
    try {
      const msg = await printBraceletTag(bracelet)
      setStatus(msg)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={printing}
        onClick={onPrint}
        className="w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {label}
      </button>
      {status && <p className="mt-2 text-center text-xs text-slate-600">{status}</p>}
    </div>
  )
}
