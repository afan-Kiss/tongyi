import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PremiumPage } from '@/components/premium'

const TABS = [
  { to: '/inventory/review-center', label: '总览', end: true },
  { to: '/inventory/review-center/reviews', label: '全部评价', end: false },
  { to: '/inventory/review-center/pending', label: '待回复', end: false },
  { to: '/inventory/review-center/negative', label: '低分评价', end: false },
  { to: '/inventory/review-center/stats', label: '统计', end: false },
] as const

export const ReviewCenterLayout: React.FC = () => (
  <PremiumPage title="好评中心" subtitle="查看千帆同步的评价，优先处理低分与待回复">
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
