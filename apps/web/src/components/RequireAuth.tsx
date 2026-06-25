import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ActivityTracker } from '@/components/ActivityTracker'
import { LicenseBlocked } from '@/components/LicenseBlocked'
import { useAuth } from '@/context/AuthContext'

export const RequireAuth: React.FC = () => {
  const { loading, licenseLoading, authed, license } = useAuth()
  const location = useLocation()

  if (loading || licenseLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-warm)] text-sm text-slate-500">
        正在验证许可…
      </div>
    )
  }

  if (!license.allowed) {
    return <LicenseBlocked message={license.message} />
  }

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return (
    <>
      <ActivityTracker />
      <Outlet />
    </>
  )
}
