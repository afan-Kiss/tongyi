import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Package, ScanLine, ScrollText, Settings, Tag } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { isAuditViewer } from '@/lib/userActivity'

const BASE_NAV = [
  { to: '/inventory', icon: LayoutDashboard, label: '总览', mobileLabel: '总览' },
  { to: '/inventory/scan', icon: ScanLine, label: '扫码', mobileLabel: '扫码' },
  { to: '/inventory/inbound?type=register', icon: Tag, label: '标签入库', mobileLabel: '入库' },
  { to: '/inventory/stock', icon: Package, label: '库存', mobileLabel: '库存' },
  { to: '/inventory/settings', icon: Settings, label: '设置', mobileLabel: '设置' },
] as const

const AUDIT_NAV = {
  to: '/inventory/audit',
  icon: ScrollText,
  label: '操作日志',
  mobileLabel: '日志',
} as const

export const InventoryLayout: React.FC = () => {
  const { username } = useAuth()
  const nav = isAuditViewer(username) ? [...BASE_NAV, AUDIT_NAV] : [...BASE_NAV]

  return (
  <div className="flex min-h-full flex-col">
    <div className="border-b border-white/40 bg-white/30">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-3 py-2 md:px-4">
        <nav className="hidden gap-1 rounded-2xl bg-white/60 p-1 md:flex">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/inventory'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-gradient-to-r from-[#ff2442] to-[#ff6b81] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white'
                }`
              }
            >
              <item.icon size={14} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>

    <main className="mobile-main-pad mx-auto w-full max-w-6xl flex-1 px-3 py-4 md:px-4">
      <div className="board-page-enter">
        <Outlet />
      </div>
    </main>

    <nav className="mobile-bottom-nav md:hidden">
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/inventory'}
          className={({ isActive }) =>
            `mobile-bottom-nav-item flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 text-[10px] leading-tight ${
              isActive ? 'text-[#ff2442] font-medium' : 'text-slate-500'
            }`
          }
        >
          <item.icon size={20} strokeWidth={2} />
          <span className="truncate max-w-full">{item.mobileLabel}</span>
        </NavLink>
      ))}
    </nav>
  </div>
  )
}
