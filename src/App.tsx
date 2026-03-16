import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import RootRoute from "@/pages/RootRoute";

import SuperadminLayout from "@/layouts/SuperadminLayout";
import SuperadminDashboard from "@/pages/superadmin/Dashboard";
import Tenants from "@/pages/superadmin/Tenants";
import TenantDetail from "@/pages/superadmin/TenantDetail";
import PermissionsPage from "@/pages/superadmin/Permissions";
import AnalyticsPage from "@/pages/superadmin/Analytics";
import SuperadminAuditLog from "@/pages/superadmin/AuditLog";

import AppLayout from "@/layouts/AppLayout";
import DashboardPage from "@/pages/app/DashboardPage";
import MeetingsPage from "@/pages/app/MeetingsPage";
import PreMeetingPage from "@/pages/app/PreMeetingPage";
import MeetingDetailPage from "@/pages/app/MeetingDetailPage";
import BoardPage from "@/pages/app/BoardPage";
import TeamPage from "@/pages/app/TeamPage";
import AuditLogPage from "@/pages/app/AuditLogPage";
import BriefPage from "@/pages/app/BriefPage";
import KpiPage from "@/pages/app/KpiPage";
import BoardRolesPage from "@/pages/app/BoardRolesPage";
import UpgradePage from "@/pages/app/UpgradePage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />

            {/* Superadmin routes */}
            <Route
              element={
                <ProtectedRoute>
                  <RoleGuard allowed={["superadmin"]}>
                    <SuperadminLayout />
                  </RoleGuard>
                </ProtectedRoute>
              }
            >
              <Route path="/superadmin/dashboard" element={<SuperadminDashboard />} />
              <Route path="/superadmin/tenants" element={<Tenants />} />
              <Route path="/superadmin/tenants/:id" element={<TenantDetail />} />
              <Route path="/superadmin/permissions" element={<PermissionsPage />} />
              <Route path="/superadmin/analytics" element={<AnalyticsPage />} />
              <Route path="/superadmin/audit-log" element={<SuperadminAuditLog />} />
            </Route>

            {/* App routes */}
            <Route
              element={
                <ProtectedRoute>
                  <RoleGuard allowed={["org_admin", "information_officer", "dirigente"]}>
                    <AppLayout />
                  </RoleGuard>
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/kpi" element={<KpiPage />} />
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/meetings/:id/pre-meeting" element={<PreMeetingPage />} />
              <Route path="/meetings/:id/brief" element={<BriefPage />} />
              <Route path="/meetings/:id" element={<MeetingDetailPage />} />
              <Route path="/board" element={<BoardPage />} />
              <Route path="/upgrade" element={<UpgradePage />} />
              <Route
                path="/team"
                element={
                  <RoleGuard allowed={["org_admin"]}>
                    <TeamPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/board-roles"
                element={
                  <RoleGuard allowed={["org_admin"]}>
                    <BoardRolesPage />
                  </RoleGuard>
                }
              />
              <Route
                path="/audit-log"
                element={
                  <RoleGuard allowed={["org_admin", "information_officer"]}>
                    <AuditLogPage />
                  </RoleGuard>
                }
              />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
