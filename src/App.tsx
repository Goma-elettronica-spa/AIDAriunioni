import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import RootRoute from "@/pages/RootRoute";
import OnboardingGuard from "@/components/OnboardingGuard";

const OnboardingPage = lazy(() => import("@/pages/app/OnboardingPage"));
const SuperadminLayout = lazy(() => import("@/layouts/SuperadminLayout"));
const SuperadminDashboard = lazy(() => import("@/pages/superadmin/Dashboard"));
const Tenants = lazy(() => import("@/pages/superadmin/Tenants"));
const TenantDetail = lazy(() => import("@/pages/superadmin/TenantDetail"));
const PermissionsPage = lazy(() => import("@/pages/superadmin/Permissions"));
const AnalyticsPage = lazy(() => import("@/pages/superadmin/Analytics"));
const SuperadminAuditLog = lazy(() => import("@/pages/superadmin/AuditLog"));

const AppLayout = lazy(() => import("@/layouts/AppLayout"));
const DashboardPage = lazy(() => import("@/pages/app/DashboardPage"));
const MeetingsPage = lazy(() => import("@/pages/app/MeetingsPage"));
const PreMeetingPage = lazy(() => import("@/pages/app/PreMeetingPage"));
const MeetingDetailPage = lazy(() => import("@/pages/app/MeetingDetailPage"));
const BoardPage = lazy(() => import("@/pages/app/BoardPage"));
const TeamPage = lazy(() => import("@/pages/app/TeamPage"));
const AuditLogPage = lazy(() => import("@/pages/app/AuditLogPage"));
const BriefPage = lazy(() => import("@/pages/app/BriefPage"));
const KpiPage = lazy(() => import("@/pages/app/KpiPage"));
const BoardRolesPage = lazy(() => import("@/pages/app/BoardRolesPage"));
const UpgradePage = lazy(() => import("@/pages/app/UpgradePage"));
const SupportPage = lazy(() => import("@/pages/app/SupportPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />

            {/* Onboarding (org_admin first login) */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <RoleGuard allowed={["org_admin"]}>
                    <OnboardingPage />
                  </RoleGuard>
                </ProtectedRoute>
              }
            />

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
                    <OnboardingGuard>
                      <AppLayout />
                    </OnboardingGuard>
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
              <Route path="/support" element={<SupportPage />} />
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
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
