import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import {
  Building2,
  Users,
  CalendarDays,
  CalendarCheck,
  Plus,
  ListTodo,
  FileCheck,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/* ------------------------------------------------------------------ */
/*  Stats hook                                                         */
/* ------------------------------------------------------------------ */
function useStats() {
  return useQuery({
    queryKey: ["superadmin-stats"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];

      const [tenants, users, meetings, meetingsThisMonth, openTasks, pendingBriefs] =
        await Promise.all([
          supabase.from("tenants").select("id", { count: "exact", head: true }),
          supabase
            .from("users")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true),
          supabase.from("meetings").select("id", { count: "exact", head: true }),
          supabase
            .from("meetings")
            .select("id", { count: "exact", head: true })
            .gte("scheduled_date", startOfMonth)
            .lte("scheduled_date", endOfMonth),
          supabase
            .from("board_tasks")
            .select("id", { count: "exact", head: true })
            .in("status", ["todo", "wip", "stuck", "waiting_for"]),
          supabase
            .from("meeting_briefs")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending_approval"),
        ]);

      return {
        tenants: tenants.count ?? 0,
        users: users.count ?? 0,
        meetings: meetings.count ?? 0,
        meetingsThisMonth: meetingsThisMonth.count ?? 0,
        openTasks: openTasks.count ?? 0,
        pendingBriefs: pendingBriefs.count ?? 0,
      };
    },
  });
}

const statCards = [
  { key: "tenants" as const, label: "Tenant Totali", icon: Building2 },
  { key: "users" as const, label: "Utenti Totali", icon: Users },
  { key: "meetings" as const, label: "Riunioni Totali", icon: CalendarDays },
  { key: "meetingsThisMonth" as const, label: "Riunioni Questo Mese", icon: CalendarCheck },
  { key: "openTasks" as const, label: "Task Aperti Globali", icon: ListTodo },
  { key: "pendingBriefs" as const, label: "Brief in Attesa", icon: FileCheck },
];

/* ------------------------------------------------------------------ */
/*  Activity timeline                                                  */
/* ------------------------------------------------------------------ */
function useRecentActivity() {
  return useQuery({
    queryKey: ["superadmin-activity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, created_at, user_id, tenant_id")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      if (!data?.length) return [];

      const userIds = [...new Set(data.map((d) => d.user_id))];
      const tenantIds = [...new Set(data.map((d) => d.tenant_id))];

      const [usersRes, tenantsRes] = await Promise.all([
        supabase.from("users").select("id, full_name").in("id", userIds),
        supabase.from("tenants").select("id, name").in("id", tenantIds),
      ]);

      const userMap = new Map((usersRes.data ?? []).map((u) => [u.id, u.full_name]));
      const tenantMap = new Map((tenantsRes.data ?? []).map((t) => [t.id, t.name]));

      return data.map((log) => ({
        ...log,
        user_name: userMap.get(log.user_id) ?? "Utente sconosciuto",
        tenant_name: tenantMap.get(log.tenant_id) ?? "Tenant sconosciuto",
      }));
    },
  });
}

const actionBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  create: { label: "Creato", variant: "default" },
  update: { label: "Aggiornato", variant: "secondary" },
  delete: { label: "Eliminato", variant: "destructive" },
};

/* ------------------------------------------------------------------ */
/*  Tenant overview with aggregates                                    */
/* ------------------------------------------------------------------ */
type TenantRow = {
  id: string;
  name: string;
  plan: string;
  created_at: string;
  userCount: number;
  meetingCount: number;
  meetingsThisMonth: number;
  activeTasks: number;
};

type SortKey = "name" | "plan" | "userCount" | "meetingCount" | "meetingsThisMonth" | "activeTasks" | "created_at";

function useTenantOverview() {
  return useQuery({
    queryKey: ["superadmin-tenant-overview"],
    queryFn: async () => {
      const { data: tenants, error } = await supabase
        .from("tenants")
        .select("id, name, plan, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!tenants?.length) return [];

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const tenantIds = tenants.map((t) => t.id);

      const [usersRes, meetingsRes, meetingsMonthRes, tasksRes] = await Promise.all([
        supabase.from("users").select("tenant_id").eq("is_active", true).in("tenant_id", tenantIds),
        supabase.from("meetings").select("tenant_id").in("tenant_id", tenantIds),
        supabase
          .from("meetings")
          .select("tenant_id")
          .in("tenant_id", tenantIds)
          .gte("scheduled_date", startOfMonth)
          .lte("scheduled_date", endOfMonth),
        supabase
          .from("board_tasks")
          .select("tenant_id")
          .in("tenant_id", tenantIds)
          .in("status", ["todo", "wip", "stuck", "waiting_for"]),
      ]);

      const count = (arr: { tenant_id: string | null }[] | null, tid: string) =>
        (arr ?? []).filter((r) => r.tenant_id === tid).length;

      return tenants.map((t): TenantRow => ({
        id: t.id,
        name: t.name,
        plan: t.plan,
        created_at: t.created_at,
        userCount: count(usersRes.data, t.id),
        meetingCount: count(meetingsRes.data, t.id),
        meetingsThisMonth: count(meetingsMonthRes.data, t.id),
        activeTasks: count(tasksRes.data, t.id),
      }));
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
const planColors: Record<string, "default" | "secondary" | "outline"> = {
  free: "secondary",
  pro: "default",
  enterprise: "outline",
};

export default function SuperadminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const stats = useStats();
  const activity = useRecentActivity();
  const tenantOverview = useTenantOverview();

  // Create tenant dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [plan, setPlan] = useState("free");
  const [vatNumber, setVatNumber] = useState("");

  // Tenant table state
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  const createTenant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tenants").insert({
        name: name.trim(),
        slug: slug.trim(),
        plan,
        vat_number: vatNumber.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-tenant-overview"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-stats"] });
      setDialogOpen(false);
      setName("");
      setSlug("");
      setSlugManual(false);
      setPlan("free");
      setVatNumber("");
      toast({ title: "Tenant creato con successo" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const filteredTenants = useMemo(() => {
    if (!tenantOverview.data) return [];
    let list = tenantOverview.data;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [tenantOverview.data, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
    return sortAsc ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pannello di Controllo</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Badge variant="outline" className="text-xs">Superadmin</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Tenant
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((card) => (
          <Card key={card.key} className="border border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-md bg-muted">
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              {stats.isLoading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <p className="text-3xl font-semibold font-mono text-foreground">
                  {stats.data?.[card.key] ?? 0}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity Timeline */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Attività Recente</h2>
        {activity.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !activity.data?.length ? (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground">Nessuna attività recente</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
            <div className="divide-y divide-border">
              {activity.data.map((log) => {
                const badge = actionBadge[log.action] ?? { label: log.action, variant: "secondary" as const };
                return (
                  <div key={log.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="text-xs text-muted-foreground font-mono shrink-0 w-[130px]">
                      {new Date(log.created_at).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge variant={badge.variant} className="text-[10px] shrink-0">
                      {badge.label}
                    </Badge>
                    <span className="text-foreground truncate">
                      <span className="font-medium">{log.user_name}</span>
                      {" ha "}
                      {log.action === "create" ? "creato" : log.action === "update" ? "aggiornato" : log.action === "delete" ? "eliminato" : log.action}
                      {" "}
                      <span className="text-muted-foreground">{log.entity_type}</span>
                      {" in "}
                      <span className="font-medium">{log.tenant_name}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tenant Overview Table */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-foreground">Panoramica Tenant</h2>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca tenant..."
              className="pl-9"
            />
          </div>
        </div>

        {tenantOverview.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !filteredTenants.length ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "Nessun tenant trovato" : "Nessun tenant ancora"}
            </p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {([
                    ["name", "Nome"],
                    ["plan", "Piano"],
                    ["userCount", "Utenti"],
                    ["meetingCount", "Riunioni"],
                    ["meetingsThisMonth", "Riunioni Mese"],
                    ["activeTasks", "Task Attivi"],
                    ["created_at", "Creato il"],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <TableHead
                      key={key}
                      className="cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort(key)}
                    >
                      <span className="inline-flex items-center">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/superadmin/tenants/${t.id}`)}
                  >
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <Badge variant={planColors[t.plan] ?? "secondary"}>{t.plan}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{t.userCount}</TableCell>
                    <TableCell className="font-mono text-sm">{t.meetingCount}</TableCell>
                    <TableCell className="font-mono text-sm">{t.meetingsThisMonth}</TableCell>
                    <TableCell className="font-mono text-sm">{t.activeTasks}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(t.created_at).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo Tenant</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTenant.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Nome</Label>
              <Input
                id="tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corporation"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-vat">P.IVA</Label>
              <Input
                id="tenant-vat"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="IT12345678901"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Slug</Label>
              <Input
                id="tenant-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugManual(true);
                }}
                placeholder="acme-corporation"
                required
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Piano</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={createTenant.isPending || !name.trim() || !slug.trim() || !vatNumber.trim()}
              >
                {createTenant.isPending ? "Creazione…" : "Crea Tenant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
