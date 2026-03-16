import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo } from "react";
import {
  Search, Users, CalendarDays, FileCheck, CheckCircle2,
  ChevronDown, ChevronRight, Download, ArrowUpDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { it } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/*  Time range                                                         */
/* ------------------------------------------------------------------ */
type RangeKey = "week" | "month" | "quarter" | "all" | "custom";
const rangeButtons: { key: RangeKey; label: string }[] = [
  { key: "week", label: "Ultima Settimana" },
  { key: "month", label: "Ultimo Mese" },
  { key: "quarter", label: "Ultimo Trimestre" },
  { key: "all", label: "Tutto" },
];

function getRange(key: RangeKey, custom?: { from: Date; to: Date }) {
  const now = new Date();
  if (key === "custom" && custom) return { from: startOfDay(custom.from).toISOString(), to: endOfDay(custom.to).toISOString() };
  if (key === "week") return { from: subDays(now, 7).toISOString(), to: now.toISOString() };
  if (key === "month") return { from: subMonths(now, 1).toISOString(), to: now.toISOString() };
  if (key === "quarter") return { from: subMonths(now, 3).toISOString(), to: now.toISOString() };
  return { from: "2000-01-01T00:00:00Z", to: now.toISOString() };
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */
function useAnalytics(from: string, to: string) {
  return useQuery({
    queryKey: ["sa-analytics", from, to],
    queryFn: async () => {
      const [
        tenantsRes, auditRes, meetingsRes, highlightsRes, tasksRes, tasksDoneRes, kpiRes, slidesRes,
      ] = await Promise.all([
        supabase.from("tenants").select("id, name"),
        supabase.from("audit_logs").select("user_id, tenant_id, created_at").gte("created_at", from).lte("created_at", to),
        supabase.from("meetings").select("id, tenant_id, created_at").gte("created_at", from).lte("created_at", to),
        supabase.from("highlights").select("user_id, meeting_id, tenant_id, created_at").gte("created_at", from).lte("created_at", to),
        supabase.from("board_tasks").select("id, tenant_id, owner_user_id, status, created_at").gte("created_at", from).lte("created_at", to),
        supabase.from("board_tasks").select("id, tenant_id, owner_user_id, status, updated_at").eq("status", "done").gte("updated_at", from).lte("updated_at", to),
        supabase.from("kpi_entries").select("id, user_id, tenant_id, created_at").gte("created_at", from).lte("created_at", to),
        supabase.from("slide_uploads").select("id, user_id, tenant_id, created_at").gte("created_at", from).lte("created_at", to),
      ]);

      const tenants = tenantsRes.data ?? [];
      const audit = auditRes.data ?? [];
      const meetings = meetingsRes.data ?? [];
      const highlights = highlightsRes.data ?? [];
      const tasks = tasksRes.data ?? [];
      const tasksDone = tasksDoneRes.data ?? [];
      const kpi = kpiRes.data ?? [];
      const slides = slidesRes.data ?? [];

      // Platform overview
      const distinctAuditUsers = new Set(audit.map((a) => a.user_id)).size;
      const meetingsCreated = meetings.length;
      const preMeetingCompleted = new Set(highlights.map((h) => `${h.user_id}|${h.meeting_id}`)).size;
      const tasksCompleted = tasksDone.length;

      // Per tenant
      const perTenant = tenants.map((t) => {
        const tAudit = audit.filter((a) => a.tenant_id === t.id);
        const tMeetings = meetings.filter((m) => m.tenant_id === t.id);
        const tHighlights = highlights.filter((h) => h.tenant_id === t.id);
        const tTasks = tasks.filter((tk) => tk.tenant_id === t.id);
        const tTasksDone = tasksDone.filter((tk) => tk.tenant_id === t.id);
        const lastAccess = tAudit.length ? tAudit.reduce((max, a) => a.created_at > max ? a.created_at : max, tAudit[0].created_at) : null;

        return {
          id: t.id,
          name: t.name,
          activeUsers: new Set(tAudit.map((a) => a.user_id)).size,
          meetingsCreated: tMeetings.length,
          preMeeting: new Set(tHighlights.map((h) => h.user_id)).size,
          tasksCreated: tTasks.length,
          tasksCompleted: tTasksDone.length,
          lastAccess,
        };
      });

      // Per user (grouped by tenant) — stored for expansion
      const perUser: Record<string, {
        id: string; name: string; email: string; role: string;
        lastAccess: string | null; preMeeting: number; kpi: number;
        tasksOwned: number; tasksDone: number; slides: number;
      }[]> = {};

      // We need user details
      const { data: allUsers } = await supabase.from("users").select("id, full_name, email, role, tenant_id").eq("is_active", true);
      const users = allUsers ?? [];

      for (const t of tenants) {
        const tUsers = users.filter((u) => u.tenant_id === t.id);
        perUser[t.id] = tUsers.map((u) => {
          const uAudit = audit.filter((a) => a.user_id === u.id);
          const uHighlights = highlights.filter((h) => h.user_id === u.id);
          const uKpi = kpi.filter((k) => k.user_id === u.id);
          const uTasksOwned = tasks.filter((tk) => tk.owner_user_id === u.id);
          const uTasksDone = tasksDone.filter((tk) => tk.owner_user_id === u.id);
          const uSlides = slides.filter((s) => s.user_id === u.id);
          const lastAccess = uAudit.length ? uAudit.reduce((max, a) => a.created_at > max ? a.created_at : max, uAudit[0].created_at) : null;

          return {
            id: u.id, name: u.full_name, email: u.email, role: u.role,
            lastAccess, preMeeting: new Set(uHighlights.map((h) => h.meeting_id)).size,
            kpi: uKpi.length, tasksOwned: uTasksOwned.length,
            tasksDone: uTasksDone.length, slides: uSlides.length,
          };
        });
      }

      return { distinctAuditUsers, meetingsCreated, preMeetingCompleted, tasksCompleted, perTenant, perUser };
    },
  });
}

/* ------------------------------------------------------------------ */
/*  CSV Export                                                         */
/* ------------------------------------------------------------------ */
function exportCsv(data: ReturnType<typeof useAnalytics>["data"]) {
  if (!data) return;
  const rows: string[] = [];
  rows.push("Tenant,Utenti Attivi,Riunioni Create,Pre-Meeting,Task Creati,Task Completati,Ultimo Accesso");
  for (const t of data.perTenant) {
    rows.push(`"${t.name}",${t.activeUsers},${t.meetingsCreated},${t.preMeeting},${t.tasksCreated},${t.tasksCompleted},${t.lastAccess ?? ""}`);
  }
  rows.push("");
  rows.push("Tenant,Nome,Email,Ruolo,Ultimo Accesso,Pre-Meeting,KPI,Task Assegnati,Task Completati,Slide");
  for (const t of data.perTenant) {
    const users = data.perUser[t.id] ?? [];
    for (const u of users) {
      rows.push(`"${t.name}","${u.name}","${u.email}","${u.role}",${u.lastAccess ?? ""},${u.preMeeting},${u.kpi},${u.tasksOwned},${u.tasksDone},${u.slides}`);
    }
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Sortable header                                                    */
/* ------------------------------------------------------------------ */
type SortDir = "asc" | "desc";

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={onClick}>
      {label}
      <ArrowUpDown className={cn("h-3 w-3", active ? "text-foreground" : "text-muted-foreground/40")} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Role labels                                                        */
/* ------------------------------------------------------------------ */
const roleLabels: Record<string, string> = {
  org_admin: "Admin",
  information_officer: "Info Officer",
  dirigente: "Dirigente",
  superadmin: "Superadmin",
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function AnalyticsPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>({ from: subMonths(new Date(), 1), to: new Date() });
  const [customFrom, setCustomFrom] = useState<Date | undefined>(customRange.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(customRange.to);

  const { from, to } = useMemo(() => getRange(rangeKey, customRange), [rangeKey, customRange]);
  const { data, isLoading } = useAnalytics(from, to);

  // Sorting
  const [sortCol, setSortCol] = useState<string>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedTenants = useMemo(() => {
    if (!data) return [];
    let list = [...data.perTenant];
    if (search) list = list.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      const av = (a as any)[sortCol];
      const bv = (b as any)[sortCol];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av ?? 0) - (bv ?? 0) : (bv ?? 0) - (av ?? 0);
    });
    return list;
  }, [data, sortCol, sortDir, search]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyCustomRange = () => {
    if (customFrom && customTo) {
      setCustomRange({ from: customFrom, to: customTo });
      setRangeKey("custom");
    }
  };

  const overviewCards = [
    { label: "Accessi Totali", value: data?.distinctAuditUsers, icon: Users },
    { label: "Riunioni Create", value: data?.meetingsCreated, icon: CalendarDays },
    { label: "Pre-Meeting Completati", value: data?.preMeetingCompleted, icon: FileCheck },
    { label: "Task Completati", value: data?.tasksCompleted, icon: CheckCircle2 },
  ];

  const cols = [
    { key: "name", label: "Tenant" },
    { key: "activeUsers", label: "Utenti Attivi" },
    { key: "meetingsCreated", label: "Riunioni" },
    { key: "preMeeting", label: "Pre-Meeting" },
    { key: "tasksCreated", label: "Task Creati" },
    { key: "tasksCompleted", label: "Task Completati" },
    { key: "lastAccess", label: "Ultimo Accesso" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
        <Button variant="outline" size="sm" onClick={() => exportCsv(data)} disabled={!data}>
          <Download className="h-4 w-4 mr-1.5" />
          Esporta CSV
        </Button>
      </div>

      {/* Time range */}
      <div className="flex flex-wrap gap-2 items-center">
        {rangeButtons.map((r) => (
          <Button
            key={r.key}
            variant={rangeKey === r.key ? "default" : "outline"}
            size="sm"
            onClick={() => setRangeKey(r.key)}
          >
            {r.label}
          </Button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={rangeKey === "custom" ? "default" : "outline"} size="sm">
              {rangeKey === "custom"
                ? `${format(customRange.from, "dd/MM/yy")} – ${format(customRange.to, "dd/MM/yy")}`
                : "Personalizzato"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4 space-y-3" align="start">
            <div className="flex gap-4">
              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">Da</p>
                <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} locale={it} className="p-2 pointer-events-auto" />
              </div>
              <div>
                <p className="text-xs font-medium mb-1 text-muted-foreground">A</p>
                <Calendar mode="single" selected={customTo} onSelect={setCustomTo} locale={it} className="p-2 pointer-events-auto" />
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={applyCustomRange} disabled={!customFrom || !customTo}>
              Applica
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {overviewCards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <c.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                {isLoading ? <Skeleton className="h-7 w-16" /> : (
                  <p className="text-2xl font-bold text-foreground">{c.value ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tenant table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Utilizzo per Tenant</h2>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca tenant..." className="pl-9 h-9" />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="border border-border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[32px]" />
                  {cols.map((c) => (
                    <TableHead key={c.key}>
                      <SortHeader label={c.label} active={sortCol === c.key} dir={sortDir} onClick={() => toggleSort(c.key)} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTenants.length === 0 ? (
                  <TableRow><TableCell colSpan={cols.length + 1} className="text-center py-8 text-muted-foreground">Nessun risultato</TableCell></TableRow>
                ) : sortedTenants.map((t) => {
                  const isZero = t.activeUsers === 0 && t.meetingsCreated === 0;
                  const isOpen = expanded.has(t.id);
                  const users = data?.perUser[t.id] ?? [];

                  return (
                    <TableRow key={t.id} className="group">
                      <TableCell colSpan={cols.length + 1} className="p-0">
                        {/* Tenant row */}
                        <button
                          className={cn(
                            "w-full flex items-center text-left hover:bg-muted/30 transition-colors",
                            isZero && "bg-destructive/5",
                          )}
                          onClick={() => toggleExpand(t.id)}
                        >
                          <div className="w-[40px] flex items-center justify-center shrink-0 py-3">
                            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                            <span className="py-3 px-2 text-sm font-medium">{t.name}</span>
                            <span className="py-3 px-2 text-sm font-mono">{t.activeUsers}</span>
                            <span className="py-3 px-2 text-sm font-mono">{t.meetingsCreated}</span>
                            <span className="py-3 px-2 text-sm font-mono">{t.preMeeting}</span>
                            <span className="py-3 px-2 text-sm font-mono">{t.tasksCreated}</span>
                            <span className="py-3 px-2 text-sm font-mono">{t.tasksCompleted}</span>
                            <span className="py-3 px-2 text-xs text-muted-foreground">
                              {t.lastAccess ? format(new Date(t.lastAccess), "dd/MM/yy HH:mm") : "—"}
                            </span>
                          </div>
                        </button>

                        {/* Expanded user rows */}
                        {isOpen && (
                          <div className="bg-muted/20 border-t border-border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30">
                                  <TableHead className="text-xs pl-12">Nome</TableHead>
                                  <TableHead className="text-xs">Email</TableHead>
                                  <TableHead className="text-xs">Ruolo</TableHead>
                                  <TableHead className="text-xs">Ultimo Accesso</TableHead>
                                  <TableHead className="text-xs">Pre-Meeting</TableHead>
                                  <TableHead className="text-xs">KPI</TableHead>
                                  <TableHead className="text-xs">Task</TableHead>
                                  <TableHead className="text-xs">Completati</TableHead>
                                  <TableHead className="text-xs">Slide</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {users.length === 0 ? (
                                  <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-4">Nessun utente</TableCell></TableRow>
                                ) : users.map((u) => (
                                  <TableRow key={u.id} className="hover:bg-muted/10">
                                    <TableCell className="text-sm pl-12">{u.name}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                                    <TableCell><Badge variant="secondary" className="text-xs">{roleLabels[u.role] ?? u.role}</Badge></TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{u.lastAccess ? format(new Date(u.lastAccess), "dd/MM/yy HH:mm") : "—"}</TableCell>
                                    <TableCell className="text-sm font-mono">{u.preMeeting}</TableCell>
                                    <TableCell className="text-sm font-mono">{u.kpi}</TableCell>
                                    <TableCell className="text-sm font-mono">{u.tasksOwned}</TableCell>
                                    <TableCell className="text-sm font-mono">{u.tasksDone}</TableCell>
                                    <TableCell className="text-sm font-mono">{u.slides}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
