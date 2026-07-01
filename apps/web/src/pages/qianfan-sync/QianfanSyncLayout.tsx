import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PremiumPage } from '@/components/premium'

const TABS = [
  { to: '/inventory/qianfan-sync', label: '总览', end: true },
  { to: '/inventory/qianfan-sync/orders', label: '订单', end: false },
  { to: '/inventory/qianfan-sync/after-sales', label: '售后', end: false },
  { to: '/inventory/qianfan-sync/reviews', label: '评价', end: false },
  { to: '/inventory/qianfan-sync/live', label: '直播', end: false },
  { to: '/inventory/qianfan-sync/logs', label: '同步日志', end: false },
  { to: '/inventory/qianfan-sync/settings', label: '设置', end: false },
] as const

export const QianfanSyncLayout: React.FC = () => (
  <PremiumPage title="千帆数据" subtitle="统一从千帆/小红书后台拉取订单、售后、评价与直播数据">
    <nav className="mb-4 flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            [
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              isActive ? 'bg-[#ff2442] text-white shadow-sm' : 'bg-white/70 text-slate-600 hover:bg-white',
            ].join(' ')
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
    <Outlet />
  </PremiumPage>
)
