import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw, ScrollText, Search } from 'lucide-react'
import { auditApi } from '@/api/endpoints'
import type { UserActivityLogRow } from '@/lib/userActivity'
import { ACTIVITY_CATEGORY_LABELS, formatDateTimeSec } from '@/lib/userActivity'
import { formatActivitySummary, formatActivityTechnical } from '@/lib/activityDisplay'

const CATEGORIES = ['', 'auth', 'navigation', 'click', 'api', 'action'] as const

export const UserActivityLogPage: React.FC = () => {
  const [items, setItems] = useState<UserActivityLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [username, setUsername] = useState('')
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await auditApi.logs({
        page,
        pageSize: 40,
        username: username.trim() || undefined,
        category: category || undefined,
        q: q.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      })
      setItems(r.data.items)
      setTotal(r.data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, username, category, q, from, to])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(total / 40))

  const onSearch = (ev: React.FormEvent) => {
    ev.preventDefault()
    setPage(1)
    void load()
  }

  const toggleDetail = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ScrollText size={20} className="text-[#ff2442]" />
            用户操作日志
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            记录谁在什么时间做了什么；点击「详情」可查看接口路径、IP 等技术信息
          </p>
        </div>
        <button
          type="button"
          data-no-audit
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300"
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>

      <form
        onSubmit={onSearch}
        className="grid gap-2 rounded-2xl border border-white/80 bg-white/70 p-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="block text-xs text-slate-500">
          操作员
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="显示用户名"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-slate-500">
          类型
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c || 'all'} value={c}>
                {c ? ACTIVITY_CATEGORY_LABELS[c] || c : '全部类型'}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-500 lg:col-span-2">
          关键词
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="操作说明、用户名…"
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-slate-500">
          起
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs text-slate-500">
          止
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-end sm:col-span-2 lg:col-span-6">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff2442] to-[#ff6b81] px-4 py-2 text-sm font-medium text-white"
          >
            <Search size={14} />
            查询
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">时间</th>
                <th className="px-3 py-2.5 font-medium">操作员</th>
                <th className="px-3 py-2.5 font-medium">操作说明</th>
                <th className="w-20 px-3 py-2.5 font-medium text-center">详情</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                    加载中…
                  </td>
                </tr>
              ) : !items.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                    暂无记录
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const expanded = expandedId === row.id
                  return (
                    <React.Fragment key={row.id}>
                      <tr className="border-b border-slate-50 hover:bg-rose-50/30">
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                          {formatDateTimeSec(row.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">
                          {row.username || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-sm leading-relaxed text-slate-700">
                          {formatActivitySummary(row)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            data-no-audit
                            onClick={() => toggleDetail(row.id)}
                            className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-white"
                          >
                            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            详情
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={4} className="px-3 py-3">
                            <p className="mb-2 text-[11px] font-medium text-slate-500">技术详情</p>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-600">
                              {JSON.stringify(formatActivityTechnical(row), null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          共 {total} 条 · 第 {page} / {pageCount} 页
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={page >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  )
}
