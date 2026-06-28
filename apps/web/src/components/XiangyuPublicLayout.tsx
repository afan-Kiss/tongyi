import React from 'react'
import { Link } from 'react-router-dom'
import { XiangyuPage } from '@/pages/XiangyuPage'

/** 打包拍照公共壳：无需登录出库入库账号 */
export const XiangyuPublicLayout: React.FC = () => (
  <div className="flex min-h-screen flex-col bg-[var(--color-bg-warm)]">
    <header className="sticky top-0 z-40 border-b border-white/60 bg-[var(--color-bg-warm)]/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:py-3 md:px-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-slate-900">祥钰 · 打包拍照</h1>
          <p className="hidden text-[11px] text-slate-500 sm:block">扫码进入，无需登录出库入库账号</p>
        </div>
        <Link
          to="/inventory"
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-slate-300"
        >
          出库入库登录
        </Link>
      </div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col">
      <XiangyuPage />
    </div>
  </div>
)
