import React from 'react'

import { CheckCircle2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react'

import type { ExcelSyncResult } from '@/lib/api'



interface Props {

  result: ExcelSyncResult | null

  loading?: boolean

  partialSuccess?: boolean

  partialMessage?: string

  onRefresh?: () => void

  onRetry?: () => void

  onClose?: () => void

}



export const ExcelSyncPanel: React.FC<Props> = ({

  result,

  loading,

  partialSuccess,

  partialMessage,

  onRefresh,

  onRetry,

  onClose,

}) => {

  if (!result && !loading && !partialSuccess) return null



  const showPartial = partialSuccess && result && !result.ok



  return (

    <div className={`rounded-2xl border p-4 shadow-lg ${

      showPartial ? 'border-amber-200 bg-amber-50/90' : 'border-white/70 bg-white/90'

    }`}>

      <div className="flex items-start justify-between gap-2">

        <div className="flex items-center gap-2">

          {loading ? (

            <RefreshCw size={18} className="animate-spin text-rose-500" />

          ) : showPartial ? (

            <AlertTriangle size={18} className="text-amber-600" />

          ) : result?.ok ? (

            <CheckCircle2 size={18} className="text-emerald-500" />

          ) : (

            <XCircle size={18} className="text-red-500" />

          )}

          <div>

            <h3 className="text-sm font-semibold text-slate-900">

              {loading ? '正在同步 Excel 并生成截图...' : showPartial ? '数据库已更新 · Excel 待同步' : 'Excel 同步结果'}

            </h3>

            {showPartial && partialMessage && (

              <p className="text-xs font-medium text-amber-700">{partialMessage}</p>

            )}

            {result && (

              <p className={`text-xs ${result.ok ? 'text-emerald-600' : showPartial ? 'text-amber-600' : 'text-red-600'}`}>

                {result.message}

              </p>

            )}

            {result?.row && (

              <p className="text-[11px] text-slate-400">

                {result.sheet} · 第 {result.row} 行

              </p>

            )}

          </div>

        </div>

        <div className="flex gap-1">

          {onRetry && showPartial && (

            <button

              type="button"

              onClick={onRetry}

              className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"

            >

              重试 Excel 同步

            </button>

          )}

          {onRefresh && (

            <button

              type="button"

              onClick={onRefresh}

              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600 hover:bg-rose-50"

            >

              重新截图

            </button>

          )}

          {onClose && (

            <button

              type="button"

              onClick={onClose}

              className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-600"

            >

              关闭

            </button>

          )}

        </div>

      </div>



      {result?.snapshotBase64 && (

        <div className="mt-3 overflow-hidden rounded-xl border border-rose-100 bg-slate-50">

          <img

            src={`data:image/png;base64,${result.snapshotBase64}`}

            alt="Excel 截图快照"

            className="w-full"

          />

          <p className="border-t border-rose-50 px-3 py-1.5 text-center text-[10px] text-slate-400">

            上图为 Excel 实际行截图（含表头），请核对数量/日期等是否已正确写入

          </p>

        </div>

      )}



      {result?.verify && Object.keys(result.verify).length > 0 && (

        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">

          {Object.entries(result.verify).map(([k, v]) => (

            <div key={k} className="rounded-lg bg-rose-50/50 px-2 py-1.5">

              <p className="text-[10px] text-slate-400">{k}</p>

              <p className="truncate text-xs font-medium text-slate-800">{v || '—'}</p>

            </div>

          ))}

        </div>

      )}

    </div>

  )

}

