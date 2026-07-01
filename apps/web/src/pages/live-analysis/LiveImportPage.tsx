import React, { useCallback, useEffect, useState } from 'react'
import { GlowBorder, PremiumButton, PremiumCard } from '@/components/premium'
import type { LiveImportBatchView } from '@/api/types'
import { liveAnalysisApi } from './liveAnalysisShared'

export const LiveImportPage: React.FC = () => {
  const [batches, setBatches] = useState<LiveImportBatchView[]>([])
  const [content, setContent] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const loadBatches = useCallback(async () => {
    try {
      const r = await liveAnalysisApi.importBatches()
      setBatches(r.data.items)
    } catch {
      setBatches([])
    }
  }, [])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setContent(String(reader.result || ''))
      setMsg(`已读取 ${file.name}，点「开始导入」上传`)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const submitCsv = async () => {
    if (!content.trim()) {
      setMsg('请先选择 CSV 文件')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const r = await liveAnalysisApi.import({ content, format: 'csv', filename: 'upload.csv' })
      setMsg(r.message || `已导入 ${r.data.imported} 行`)
      setContent('')
      await loadBatches()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '导入失败')
    } finally {
      setBusy(false)
    }
  }

  const tryExcel = async () => {
    setBusy(true)
    try {
      const r = await liveAnalysisApi.import({ content: '', format: 'excel', filename: 'orders.xlsx' })
      setMsg(r.message || r.data.message || '已记录')
      await loadBatches()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <GlowBorder>
        <PremiumCard title="CSV 导入（第一版）">
          <p className="mb-3 text-sm text-slate-600">
            支持列名：主播/anchorName、场次号/sessionNo、订单号/orderNo、支付金额/amount、有效成交/validAmount、退款/refundAmount、售后状态/afterSaleStatus、商品/productName 等。
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
            className="mb-3 block text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <PremiumButton disabled={busy} onClick={() => void submitCsv()}>
              {busy ? '导入中…' : '开始导入 CSV'}
            </PremiumButton>
            <PremiumButton variant="secondary" disabled={busy} onClick={() => void tryExcel()}>
              Excel（迁移中）
            </PremiumButton>
          </div>
          {msg ? <p className="mt-3 text-sm text-slate-600">{msg}</p> : null}
        </PremiumCard>
      </GlowBorder>

      <PremiumCard title="导入记录">
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">还没有导入记录</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {batches.map((b) => (
              <li key={b.id} className="rounded-lg bg-white/60 p-2">
                <span className="font-medium">{b.filename || b.source}</span>
                <span className="ml-2 text-slate-500">{b.statusLabel}</span>
                {b.importedCount > 0 ? <span className="ml-2">· {b.importedCount} 行</span> : null}
                {b.errorMessage ? <p className="text-xs text-amber-700">{b.errorMessage}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </PremiumCard>
    </div>
  )
}
