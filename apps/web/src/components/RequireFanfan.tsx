import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { isAuditViewer } from '@/lib/userActivity'

export const RequireFanfan: React.FC = () => {
  const { loading, authed, username } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        正在验证权限…
      </div>
    )
  }

  if (!authed) {
    return <Navigate to="/login" replace />
  }

  if (!isAuditViewer(username)) {
    return <Navigate to="/inventory" replace />
  }

  return <Outlet />
}
