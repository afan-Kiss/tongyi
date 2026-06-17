import React, { useState } from 'react'

import type { Bracelet } from '@/api/types'

import { AppMessageDialog } from '@/components/AppMessageDialog'

import { printBraceletTag } from '@/lib/printBraceletTag'
import { formatPrintSentMessage } from '@/lib/formatPrintSentMessage'
import type { LabelPrintMemory } from '@/lib/labelPrintMemory'

interface Props {
  bracelet: Bracelet
  /** 按钮文案，默认「打印吊牌」 */
  label?: string
  /** 与入库页共用的吊牌文字记忆；不传则从本地读取 */
  labelMemory?: LabelPrintMemory
}

export const LabelPrintPanel: React.FC<Props> = ({
  bracelet,
  label = '打印吊牌',
  labelMemory: labelMemoryProp,
}) => {
  const [status, setStatus] = useState('')
  const [printing, setPrinting] = useState(false)
  const [messageDialog, setMessageDialog] = useState<{
    title: string
    message: string
    variant?: 'error' | 'success' | 'info'
  } | null>(null)

  const onPrint = async () => {
    setPrinting(true)
    setStatus('正在发送到标签机…')
    try {
      await printBraceletTag(
        bracelet,
        labelMemoryProp ? { labelMemory: labelMemoryProp } : undefined,
      )
      const msg = formatPrintSentMessage({ bracelet, labelMemory: labelMemoryProp })
      setStatus(msg)
      setMessageDialog({ title: '打印已发送', message: msg, variant: 'success' })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      setStatus(err)
      setMessageDialog({ title: '打印失败', message: err, variant: 'error' })
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={printing}
        onClick={onPrint}
        className="w-full rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {label}
      </button>
      {status && <p className="text-center text-xs text-slate-600">{status}</p>}
      <AppMessageDialog
        open={messageDialog !== null}
        title={messageDialog?.title || ''}
        message={messageDialog?.message || ''}
        variant={messageDialog?.variant}
        onClose={() => setMessageDialog(null)}
      />
    </div>
  )
}
