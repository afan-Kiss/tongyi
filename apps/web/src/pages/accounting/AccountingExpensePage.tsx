import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { accountingApi } from '@/api/endpoints'
import { GlowBorder, PremiumButton, PremiumCard } from '@/components/premium'
import type { AccountingRecordType } from '@/api/types'

interface Props {
  recordType: Extract<AccountingRecordType, 'expense' | 'cashback'>
  title: string
}

export const AccountingEntryFormPage: React.FC<Props> = ({ recordType, title }) => {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    amount: '',
    externalOrderNo: '',
    logisticsNo: '',
    buyerName: '',
    buyerPhone: '',
    summary: '',
    remark: '',
    createFinanceAlert: true,
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async () => {
    const amount = Number(form.amount)
    if (!amount || amount <= 0) {
      setMsg('请填写有效金额')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const r = await accountingApi.create({
        recordType,
        amount,
        externalOrderNo: form.externalOrderNo.trim() || undefined,
        logisticsNo: form.logisticsNo.trim() || undefined,
        buyerName: form.buyerName.trim() || undefined,
        buyerPhone: form.buyerPhone.trim() || undefined,
        summary: form.summary.trim() || undefined,
        remark: form.remark.trim() || undefined,
        createFinanceAlert: form.createFinanceAlert,
      })
      setMsg(r.message || '已保存')
      setTimeout(() => navigate('/inventory/accounting/transactions'), 800)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder?: string, type = 'text') => (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            [key]: type === 'checkbox' ? e.target.checked : e.target.value,
          }))
        }
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
      />
    </label>
  )

  return (
    <GlowBorder>
      <PremiumCard title={title}>
        <div className="grid gap-3 sm:grid-cols-2">
          {field('amount', '金额（元）*', '例如 88.00', 'number')}
          {field('externalOrderNo', '订单号', '千帆/平台订单号')}
          {field('logisticsNo', '物流单号', '扫码时可匹配提醒')}
          {field('buyerName', '买家昵称')}
          {field('buyerPhone', '买家手机')}
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">摘要</span>
            <input
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
              placeholder="给员工看的简短说明"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-slate-600">备注</span>
            <textarea
              value={form.remark}
              onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
              rows={2}
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.createFinanceAlert}
              onChange={(e) => setForm((f) => ({ ...f, createFinanceAlert: e.target.checked }))}
            />
            保存后自动生成扫码财务提醒（需填写订单号或物流单号）
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <PremiumButton disabled={busy} onClick={() => void submit()}>
            {busy ? '保存中…' : '保存'}
          </PremiumButton>
          {msg ? <span className="text-sm text-slate-600">{msg}</span> : null}
        </div>
      </PremiumCard>
    </GlowBorder>
  )
}

export const AccountingExpensePage: React.FC = () => (
  <AccountingEntryFormPage recordType="expense" title="记支出" />
)

export const AccountingCashbackPage: React.FC = () => (
  <AccountingEntryFormPage recordType="cashback" title="记返现" />
)
