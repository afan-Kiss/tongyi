import React, { useEffect, useState } from 'react'

import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AnimatedTabs } from '@/components/ui/AnimatedTabs'

import { settingsApi } from '@/api/endpoints'
import { useAuth } from '@/context/AuthContext'

export const PortalLayout: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { username, displayName, logout } = useAuth()
  const sector = location.pathname.startsWith('/xiangyu') ? 'xiangyu' : 'inventory'
  const isXiangyu = sector === 'xiangyu'

  const [xiangyuOnline, setXiangyuOnline] = useState(true)

  useEffect(() => {
    settingsApi
      .status()
      .then((r) => setXiangyuOnline(r.data.xiangyu?.online ?? false))
      .catch(() => setXiangyuOnline(false))
  }, [])

  const tabs = [
    { key: 'inventory', label: '出库入库' },
    {
      key: 'xiangyu',
      label: xiangyuOnline ? '打包拍照发送' : '打包拍照发送（离线）',
    },
  ]

  const onTabChange = (key: string) => {
    if (key === 'xiangyu' && !xiangyuOnline) return
    navigate(key === 'xiangyu' ? '/xiangyu' : '/inventory')
  }

  const onLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const showNameReminder = Boolean(username) && !displayName

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="sticky top-0 z-40 border-b border-white/60 bg-[var(--color-bg-warm)]/90 backdrop-blur-md pt-[env(safe-area-inset-top)] [--app-header-h:3.75rem] sm:[--app-header-h:4.25rem]"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3 md:px-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-slate-900">统一经营台</h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">出库入库 · 打包拍照发送</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <AnimatedTabs
              items={tabs.map((t) => ({
                ...t,
                label:
                  t.key === 'xiangyu' && !xiangyuOnline
                    ? '拍照（离线）'
                    : t.key === 'xiangyu'
                      ? '打包拍照'
                      : t.label,
              }))}
              activeKey={sector}
              onChange={onTabChange}
              className="shrink-0"
            />

            <div className="flex items-center gap-2 sm:ml-2">
              {displayName ? (
                <span className="hidden text-xs text-slate-500 sm:inline">{displayName}</span>
              ) : username ? (
                <span className="hidden text-xs text-amber-700 sm:inline">未设用户名</span>
              ) : null}
              <button
                type="button"
                onClick={() => void onLogout()}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                退出
              </button>
            </div>
          </div>
        </div>

        {showNameReminder && (
          <div className="border-t border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-900">
            <span>您还未设置用户名（每个登录账号各自保存，与登录密码无关）。</span>
            <button
              type="button"
              onClick={() => navigate('/inventory/settings')}
              className="ml-2 font-medium text-amber-950 underline decoration-amber-400 underline-offset-2 hover:text-amber-800"
            >
              去设置
            </button>
          </div>
        )}
      </header>

      <div className={isXiangyu ? 'flex min-h-0 flex-1 flex-col' : 'flex-1'}>
        <Outlet />
      </div>
    </div>
  )
}
