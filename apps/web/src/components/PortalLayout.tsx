import React, { useEffect, useState } from 'react'

import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { AnimatedTabs } from '@/components/ui/AnimatedTabs'

import { settingsApi } from '@/api/endpoints'



export const PortalLayout: React.FC = () => {

  const location = useLocation()

  const navigate = useNavigate()

  const sector = location.pathname.startsWith('/xiangyu') ? 'xiangyu' : 'inventory'

  const isXiangyu = sector === 'xiangyu'

  const [xiangyuOnline, setXiangyuOnline] = useState(true)



  useEffect(() => {

    settingsApi.status()

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



  return (

    <div className="flex min-h-screen flex-col">

      <header className="sticky top-0 z-40 border-b border-white/60 bg-[var(--color-bg-warm)]/90 backdrop-blur-md pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3 md:px-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">和田玉手镯管理系统</h1>
            <p className="hidden text-[11px] text-slate-500 sm:block">出库入库 · 打包拍照发送</p>
          </div>
          <AnimatedTabs
            items={tabs.map((t) => ({
              ...t,
              label: t.key === 'xiangyu' && !xiangyuOnline
                ? '拍照（离线）'
                : t.key === 'xiangyu'
                  ? '打包拍照'
                  : t.label,
            }))}

            activeKey={sector}

            onChange={onTabChange}

            className="shrink-0"

          />

        </div>

      </header>



      <div className={isXiangyu ? 'flex min-h-0 flex-1 flex-col' : 'flex-1'}>

        <Outlet />

      </div>

    </div>

  )

}

