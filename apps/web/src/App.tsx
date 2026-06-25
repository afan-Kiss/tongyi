import React from 'react'

import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { AuthProvider } from '@/context/AuthContext'

import { RequireAuth } from '@/components/RequireAuth'

import { PortalLayout } from '@/components/PortalLayout'

import { InventoryLayout } from '@/components/InventoryLayout'

import { DashboardPage } from '@/pages/Dashboard'

import { ScanPage } from '@/pages/ScanPage'

import { InventoryPage } from '@/pages/Inventory'

import { InboundFormPage } from '@/pages/InboundForm'

import { MobileCameraPage } from '@/pages/MobileCameraPage'

import { SettingsPage } from '@/pages/Settings'

import { XiangyuPage } from '@/pages/XiangyuPage'

import { LoginPage } from '@/pages/LoginPage'

import { UserActivityLogPage } from '@/pages/UserActivityLogPage'

import { RequireFanfan } from '@/components/RequireFanfan'



const LegacyRedirect: React.FC<{ to: string }> = ({ to }) => <Navigate to={to} replace />



/** 旧链接 /mobile/capture?s=… → 保留 query 跳到拍照页（不走登录/许可校验） */

const MobileCaptureRedirect: React.FC = () => {

  const { search } = useLocation()

  return <Navigate to={`/inventory/mobile-camera${search}`} replace />

}



const AuthenticatedRoutes: React.FC = () => (

  <AuthProvider>

    <Routes>

      <Route path="/login" element={<LoginPage />} />



      <Route element={<RequireAuth />}>

        <Route element={<PortalLayout />}>

          <Route path="/inventory" element={<InventoryLayout />}>

            <Route index element={<DashboardPage />} />

            <Route path="scan" element={<ScanPage />} />

            <Route path="stock" element={<InventoryPage />} />

            <Route path="inbound" element={<InboundFormPage />} />

            <Route path="settings" element={<SettingsPage />} />

            <Route element={<RequireFanfan />}>
              <Route path="audit" element={<UserActivityLogPage />} />
            </Route>

          </Route>

          <Route path="/xiangyu" element={<XiangyuPage />} />



          <Route path="/" element={<LegacyRedirect to="/inventory" />} />

          <Route path="/scan" element={<LegacyRedirect to="/inventory/scan" />} />

          <Route path="/inbound" element={<LegacyRedirect to="/inventory/inbound?type=register" />} />

          <Route path="/settings" element={<LegacyRedirect to="/inventory/settings" />} />

          <Route path="/inventory/inventory" element={<LegacyRedirect to="/inventory/stock" />} />

        </Route>

      </Route>



      <Route path="*" element={<Navigate to="/inventory" replace />} />

    </Routes>

  </AuthProvider>

)



export const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      {/* 手机拍照：独立公共页（生产环境由 mobile-camera.html 直出，此处作开发/兜底） */}
      <Route path="/inventory/mobile-camera" element={<MobileCameraPage />} />
      <Route path="/mobile/capture" element={<MobileCaptureRedirect />} />
      <Route path="/*" element={<AuthenticatedRoutes />} />
    </Routes>
  </BrowserRouter>
)

