import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export const RequireFanfan: React.FC = () => {
  const { loading, authed, isAdmin } = useAuth()

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

  if (!isAdmin) {
    return <Navigate to="/inventory" replace />
  }

  return <Outlet />
}
