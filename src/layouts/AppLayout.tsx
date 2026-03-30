import { Outlet, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantName } from "@/hooks/use-tenant-name";
import {
  LayoutDashboard,
  CalendarDays,
  Columns3,
  Users,
  ShieldCheck,
  LogOut,
  Menu,
  TrendingUp,
  Network,
  Lightbulb,
  LifeBuoy,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useState, useMemo } from "react";

const allNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: null },
  { title: "KPI", url: "/kpi", icon: TrendingUp, roles: ["org_admin", "information_officer", "dirigente"] as string[] },
  { title: "Meetings", url: "/meetings", icon: CalendarDays, roles: ["org_admin", "information_officer", "dirigente"] as string[] },
  { title: "TO DOs", url: "/board", icon: Columns3, roles: ["org_admin", "information_officer", "dirigente"] as string[] },
  { title: "Upgrade", url: "/upgrade", icon: Lightbulb, roles: null },
  { title: "Team", url: "/team", icon: Users, roles: ["org_admin"] as string[] },
  { title: "Organizational Chart", url: "/board-roles", icon: Network, roles: ["org_admin"] as string[] },
  { title: "Audit Log", url: "/audit-log", icon: ShieldCheck, roles: ["org_admin", "information_officer"] as string[] },
  { title: "Support", url: "/support", icon: LifeBuoy, roles: null },
];

const roleLabels: Record<string, string> = {
  org_admin: "Admin",
  information_officer: "Info Officer",
  dirigente: "User",
};

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const tenantName = useTenantName(user?.tenant_id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = useMemo(() => {
    if (!user) return [];
    return allNavItems.filter(
      (item) => item.roles === null || item.roles.includes(user.role)
    );
  }, [user]);

  if (user?.role === "superadmin") {
    return <Navigate to="/superadmin/dashboard" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border">
        <Logo size="sm" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/dashboard"}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            activeClassName="bg-accent text-foreground font-medium"
            onClick={() => setMobileOpen(false)}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.full_name}
            </p>
            <Badge variant="secondary" className="mt-1 text-xs font-normal">
              {roleLabels[user?.role ?? ""] ?? user?.role}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground shrink-0"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:shrink-0 z-30">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-60 h-full">{sidebar}</aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top bar */}
        <header className="h-14 shrink-0 border-b border-border flex items-center px-4 md:px-6 bg-background z-20">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-sm font-medium text-foreground">
            {tenantName ?? <span className="text-muted-foreground">Caricamento…</span>}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {user && (
              <NotificationBell userId={user.id} tenantId={user.tenant_id} />
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
