import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PremiumPage } from '@/components/premium'

const TABS = [
  { to: '/inventory/live-analysis', label: '总览', end: true },
  { to: '/inventory/live-analysis/sessions', label: '直播场次', end: false },
  { to: '/inventory/live-analysis/anchors', label: '主播榜单', end: false },
  { to: '/inventory/live-analysis/refunds', label: '退款分析', end: false },
  { to: '/inventory/live-analysis/products', label: '商品分析', end: false },
  { to: '/inventory/live-analysis/suggestions', label: '经营建议', end: false },
  { to: '/inventory/live-analysis/import', label: '数据导入', end: false },
  { to: '/inventory/live-analysis/settings', label: '设置', end: false },
] as const

export const LiveAnalysisLayout: React.FC = () => (
  <PremiumPage title="主播分析" subtitle="tongyi 原生模块 · 帮你看懂直播成交、退款和该安排什么">
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
