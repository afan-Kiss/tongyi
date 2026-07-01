import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PremiumPage } from '@/components/premium'

const TABS = [
  { to: '/inventory/accounting', label: '总览', end: true },
  { to: '/inventory/accounting/transactions', label: '流水', end: false },
  { to: '/inventory/accounting/expense', label: '记支出', end: false },
  { to: '/inventory/accounting/cashback', label: '记返现', end: false },
  { to: '/inventory/accounting/settings', label: '设置', end: false },
] as const

export const AccountingLayout: React.FC = () => (
  <PremiumPage title="经营记账" subtitle="tongyi 原生记账模块，已与扫码财务提醒联动">
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
