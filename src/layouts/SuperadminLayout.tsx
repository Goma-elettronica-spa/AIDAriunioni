import { Outlet, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LayoutDashboard, Building2, LogOut, Menu, ShieldCheck, BarChart3, Eye } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

const navItems = [
  { title: "Dashboard", url: "/superadmin/dashboard", icon: LayoutDashboard },
  { title: "Tenant", url: "/superadmin/tenants", icon: Building2 },
  { title: "Permessi", url: "/superadmin/permissions", icon: ShieldCheck },
  { title: "Analytics", url: "/superadmin/analytics", icon: BarChart3 },
  { title: "Audit Log", url: "/superadmin/audit-log", icon: Eye },
];

export default function SuperadminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (user && user.role !== "superadmin") {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const navContent = (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.url}
          to={item.url}
          end
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-primary-foreground/70 hover:bg-primary-foreground/10 transition-colors"
          activeClassName="bg-primary-foreground/15 text-primary-foreground font-medium"
          onClick={() => setMobileOpen(false)}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.title}</span>
        </NavLink>
      ))}
    </>
  );

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-5 border-b border-primary-foreground/10">
        <h2 className="text-sm font-semibold tracking-wide">Riunioni in Cloud</h2>
        <p className="text-xs text-primary-foreground/60 mt-0.5">Superadmin</p>
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1">
        <nav className="px-3 py-4 space-y-1">
          {navContent}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-primary-foreground/10">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-xs text-primary-foreground/60">superadmin</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 shrink-0"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 z-30 bg-primary text-primary-foreground">
        {sidebarInner}
      </aside>

      {/* Mobile sidebar via Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-primary text-primary-foreground border-r-0 [&>button]:text-primary-foreground/70 [&>button]:hover:text-primary-foreground">
          <SheetTitle className="sr-only">Menu navigazione</SheetTitle>
          {sidebarInner}
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center px-3 sm:px-4 md:px-6 bg-background sticky top-0 z-20">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-1.5 shrink-0"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-sm font-medium text-foreground truncate">
            <span className="hidden sm:inline">Riunioni in Cloud — </span>
            <span className="text-muted-foreground">Superadmin</span>
          </h1>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {user && (
              <NotificationBell userId={user.id} tenantId={user.tenant_id} />
            )}
            <span className="text-sm text-muted-foreground hidden lg:inline">{user?.full_name}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="hidden sm:flex">
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Esci
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-5 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
