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

import { XiangyuPublicLayout } from '@/components/XiangyuPublicLayout'

import { LoginPage } from '@/pages/LoginPage'

import { UserActivityLogPage } from '@/pages/UserActivityLogPage'

import { QianfanRelayPage } from '@/pages/QianfanRelayPage'

import { AgentCenterPage } from '@/pages/AgentCenterPage'

import { SystemStatusPage } from '@/pages/SystemStatusPage'

import { AccountingLayout } from '@/pages/accounting/AccountingLayout'
import { AccountingDashboardPage } from '@/pages/accounting/AccountingDashboardPage'
import { AccountingTransactionsPage } from '@/pages/accounting/AccountingTransactionsPage'
import { AccountingExpensePage, AccountingCashbackPage } from '@/pages/accounting/AccountingExpensePage'
import { AccountingSettingsPage } from '@/pages/accounting/AccountingSettingsPage'

import { LiveAnalysisLayout } from '@/pages/live-analysis/LiveAnalysisLayout'
import { LiveAnalysisDashboardPage } from '@/pages/live-analysis/LiveAnalysisDashboardPage'
import { LiveSessionsPage } from '@/pages/live-analysis/LiveSessionsPage'
import { LiveSessionDetailPage } from '@/pages/live-analysis/LiveSessionDetailPage'
import { AnchorRankingPage } from '@/pages/live-analysis/AnchorRankingPage'
import { RefundAnalysisPage } from '@/pages/live-analysis/RefundAnalysisPage'
import { ProductAnalysisPage } from '@/pages/live-analysis/ProductAnalysisPage'
import { LiveImportPage } from '@/pages/live-analysis/LiveImportPage'
import { LiveSuggestionsPage } from '@/pages/live-analysis/LiveSuggestionsPage'
import { LiveAnalysisSettingsPage } from '@/pages/live-analysis/LiveAnalysisSettingsPage'

import { QianfanSyncLayout } from '@/pages/qianfan-sync/QianfanSyncLayout'
import { QianfanSyncDashboardPage } from '@/pages/qianfan-sync/QianfanSyncDashboardPage'
import { QianfanSyncOrdersPage } from '@/pages/qianfan-sync/QianfanSyncOrdersPage'
import { QianfanSyncAfterSalesPage } from '@/pages/qianfan-sync/QianfanSyncAfterSalesPage'
import { QianfanSyncReviewsPage } from '@/pages/qianfan-sync/QianfanSyncReviewsPage'
import { QianfanSyncLivePage } from '@/pages/qianfan-sync/QianfanSyncLivePage'
import { QianfanSyncLogsPage } from '@/pages/qianfan-sync/QianfanSyncLogsPage'
import { QianfanSyncSettingsPage } from '@/pages/qianfan-sync/QianfanSyncSettingsPage'

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

            <Route path="qianfan" element={<QianfanRelayPage />} />
            <Route path="accounting" element={<AccountingLayout />}>
              <Route index element={<AccountingDashboardPage />} />
              <Route path="transactions" element={<AccountingTransactionsPage />} />
              <Route path="expense" element={<AccountingExpensePage />} />
              <Route path="cashback" element={<AccountingCashbackPage />} />
              <Route path="settings" element={<AccountingSettingsPage />} />
            </Route>
            <Route path="live-analysis" element={<LiveAnalysisLayout />}>
              <Route index element={<LiveAnalysisDashboardPage />} />
              <Route path="sessions" element={<LiveSessionsPage />} />
              <Route path="sessions/:id" element={<LiveSessionDetailPage />} />
              <Route path="anchors" element={<AnchorRankingPage />} />
              <Route path="refunds" element={<RefundAnalysisPage />} />
              <Route path="products" element={<ProductAnalysisPage />} />
              <Route path="import" element={<LiveImportPage />} />
              <Route path="suggestions" element={<LiveSuggestionsPage />} />
              <Route path="settings" element={<LiveAnalysisSettingsPage />} />
            </Route>
            <Route path="qianfan-sync" element={<QianfanSyncLayout />}>
              <Route index element={<QianfanSyncDashboardPage />} />
              <Route path="orders" element={<QianfanSyncOrdersPage />} />
              <Route path="after-sales" element={<QianfanSyncAfterSalesPage />} />
              <Route path="reviews" element={<QianfanSyncReviewsPage />} />
              <Route path="live" element={<QianfanSyncLivePage />} />
              <Route path="logs" element={<QianfanSyncLogsPage />} />
              <Route path="settings" element={<QianfanSyncSettingsPage />} />
            </Route>
            <Route path="agents" element={<AgentCenterPage />} />
            <Route path="system-status" element={<SystemStatusPage />} />

            <Route element={<RequireFanfan />}>
              <Route path="audit" element={<UserActivityLogPage />} />
            </Route>

          </Route>



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
      <Route path="/xiangyu" element={<XiangyuPublicLayout />} />
      <Route path="/*" element={<AuthenticatedRoutes />} />
    </Routes>
  </BrowserRouter>
)

