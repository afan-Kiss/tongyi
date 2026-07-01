import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PremiumPage } from '@/components/premium'

const TABS = [
  { to: '/inventory/after-sales', label: '总览', end: true },
  { to: '/inventory/after-sales/list', label: '全部售后', end: false },
  { to: '/inventory/after-sales/refunds', label: '退款单', end: false },
  { to: '/inventory/after-sales/pending', label: '待处理', end: false },
] as const

export const AfterSaleWorkbenchLayout: React.FC = () => (
  <PremiumPage title="售后工作台" subtitle="跟进千帆同步的售后与退款，配合财务确认">
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
