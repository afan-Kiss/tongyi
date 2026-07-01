import React, { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  LayoutDashboard,
  MessageCircle,
  MonitorCog,
  MoreHorizontal,
  Package,
  ScanLine,
  ScrollText,
  Settings,
  Tag,
  WalletCards,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { isAuditViewer } from '@/lib/userActivity'

const DESKTOP_NAV = [
  { to: '/inventory', icon: LayoutDashboard, label: '总览', end: true },
  { to: '/inventory/scan', icon: ScanLine, label: '扫码' },
  { to: '/inventory/inbound?type=register', icon: Tag, label: '标签入库' },
  { to: '/inventory/stock', icon: Package, label: '库存' },
  { to: '/inventory/qianfan', icon: MessageCircle, label: '千帆客服' },
  { to: '/inventory/accounting', icon: WalletCards, label: '经营记账' },
  { to: '/inventory/live-analysis', icon: BarChart3, label: '主播分析' },
  { to: '/inventory/agents', icon: MonitorCog, label: '本地助手' },
  { to: '/inventory/system-status', icon: Activity, label: '系统状态' },
  { to: '/inventory/settings', icon: Settings, label: '设置' },
] as const

const MOBILE_PRIMARY = [
  { to: '/inventory', icon: LayoutDashboard, label: '总览', end: true },
  { to: '/inventory/scan', icon: ScanLine, label: '扫码' },
  { to: '/inventory/stock', icon: Package, label: '库存' },
  { to: '/inventory/qianfan', icon: MessageCircle, label: '千帆' },
] as const

const MOBILE_MORE = [
  { to: '/inventory/inbound?type=register', icon: Tag, label: '标签入库' },
  { to: '/inventory/accounting', icon: WalletCards, label: '经营记账' },
  { to: '/inventory/live-analysis', icon: BarChart3, label: '主播分析' },
  { to: '/inventory/agents', icon: MonitorCog, label: '本地助手' },
  { to: '/inventory/system-status', icon: Activity, label: '系统状态' },
  { to: '/inventory/settings', icon: Settings, label: '设置' },
  { to: '/inventory/audit', icon: ScrollText, label: '操作日志', auditOnly: true },
] as const

function navClass(isActive: boolean, compact = false) {
  return [
    'flex items-center gap-1.5 rounded-full font-medium transition',
    compact ? 'flex-col px-0.5 text-[10px] leading-tight' : 'px-3 py-2 text-sm',
    isActive
      ? compact
        ? 'text-[#ff2442] font-semibold'
        : 'bg-gradient-to-r from-[#ff2442] to-[#ff6b81] text-white shadow-sm'
      : compact
        ? 'text-slate-500'
        : 'text-slate-600 hover:bg-white/80',
  ].join(' ')
}

export const InventoryLayout: React.FC = () => {
  const { username } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const showAudit = isAuditViewer(username)

  const desktopNav = showAudit
    ? [...DESKTOP_NAV, { to: '/inventory/audit', icon: ScrollText, label: '操作日志', end: false as const }]
    : DESKTOP_NAV

  const moreItems = MOBILE_MORE.filter((item) => !('auditOnly' in item && item.auditOnly) || showAudit)

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-white/40 bg-white/30 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-6xl px-3 py-2 md:px-4">
          <nav className="premium-nav-scroll hidden md:block">
            <div className="premium-nav-row rounded-2xl bg-white/60 p-1.5">
              {desktopNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) => navClass(isActive)}
                >
                  <item.icon size={14} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </div>

      <main className="mobile-main-pad mx-auto w-full max-w-6xl flex-1 px-3 py-4 md:px-4">
        <div className="board-page-enter">
          <Outlet />
        </div>
      </main>

      {moreOpen ? (
        <div className="premium-mobile-more-sheet md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="premium-mobile-more-panel" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">更多功能</h3>
              <button type="button" className="text-xs text-slate-500" onClick={() => setMoreOpen(false)}>关闭</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {moreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-[11px] ${
                      isActive ? 'bg-rose-50 text-[#ff2442]' : 'bg-slate-50 text-slate-600'
                    }`
                  }
                >
                  <item.icon size={20} />
                  <span className="text-center leading-tight">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="mobile-bottom-nav md:hidden">
        {MOBILE_PRIMARY.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/inventory'} className={({ isActive }) => `mobile-bottom-nav-item min-w-0 flex-1 ${navClass(isActive, true)}`}>
            <item.icon size={20} strokeWidth={2} />
            <span className="truncate max-w-full">{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className={`mobile-bottom-nav-item min-w-0 flex-1 ${navClass(moreOpen, true)}`} onClick={() => setMoreOpen(true)}>
          <MoreHorizontal size={20} strokeWidth={2} />
          <span className="truncate max-w-full">更多</span>
        </button>
      </nav>
    </div>
  )
}
