import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import NotFound from "@/pages/NotFound";

import SuperadminLayout from "@/layouts/SuperadminLayout";
import SuperadminDashboard from "@/pages/superadmin/Dashboard";
import Tenants from "@/pages/superadmin/Tenants";

import AppLayout from "@/layouts/AppLayout";
import DashboardPage from "@/pages/app/DashboardPage";
import MeetingsPage from "@/pages/app/MeetingsPage";
import PreMeetingPage from "@/pages/app/PreMeetingPage";
import BoardPage from "@/pages/app/BoardPage";
import TeamPage from "@/pages/app/TeamPage";
import AuditLogPage from "@/pages/app/AuditLogPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

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
              <Route path="/meetings" element={<MeetingsPage />} />
              <Route path="/board" element={<BoardPage />} />
              <Route
                path="/team"
                element={
                  <RoleGuard allowed={["org_admin"]}>
                    <TeamPage />
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
