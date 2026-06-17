import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PortalLayout } from '@/components/PortalLayout'
import { InventoryLayout } from '@/components/InventoryLayout'
import { DashboardPage } from '@/pages/Dashboard'
import { ScanPage } from '@/pages/ScanPage'
import { InventoryPage } from '@/pages/Inventory'
import { InboundFormPage } from '@/pages/InboundForm'
import { MobileCameraPage } from '@/pages/MobileCameraPage'
import { SettingsPage } from '@/pages/Settings'
import { XiangyuPage } from '@/pages/XiangyuPage'

const LegacyRedirect: React.FC<{ to: string }> = ({ to }) => <Navigate to={to} replace />

export const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<PortalLayout />}>
        <Route path="/inventory" element={<InventoryLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="stock" element={<InventoryPage />} />
          <Route path="inbound" element={<InboundFormPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/xiangyu" element={<XiangyuPage />} />
        <Route path="/inventory/mobile-camera" element={<MobileCameraPage />} />

        <Route path="/" element={<LegacyRedirect to="/inventory" />} />
        <Route path="/scan" element={<LegacyRedirect to="/inventory/scan" />} />
        <Route path="/inbound" element={<LegacyRedirect to="/inventory/inbound?type=register" />} />
        <Route path="/mobile/capture" element={<LegacyRedirect to="/inventory/mobile-camera" />} />
        <Route path="/settings" element={<LegacyRedirect to="/inventory/settings" />} />
        <Route path="/inventory/inventory" element={<LegacyRedirect to="/inventory/stock" />} />
      </Route>
      <Route path="*" element={<Navigate to="/inventory" replace />} />
    </Routes>
  </BrowserRouter>
)
