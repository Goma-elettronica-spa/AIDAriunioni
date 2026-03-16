import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useCallback } from "react";
import {
  Search, Download, ChevronDown, ChevronRight, Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PAGE_SIZE = 50;

const entityLabels: Record<string, string> = {
  kpi_entry: "Valore KPI",
  highlight: "Highlight",
  commitment: "Impegno",
  board_task: "Task",
  meeting_brief: "Brief",
  meeting: "Riunione",
  user: "Utente",
  tenant: "Tenant",
  kpi_definition: "Definizione KPI",
  slide_upload: "Slide",
};

const actionColors: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-700 border-emerald-500/20",
  update: "bg-blue-500/15 text-blue-700 border-blue-500/20",
  delete: "bg-red-500/15 text-red-700 border-red-500/20",
};

/* ------------------------------------------------------------------ */
/*  JSON Diff View                                                     */
/* ------------------------------------------------------------------ */
function JsonDiff({ oldVal, newVal }: { oldVal: Record<string, any> | null; newVal: Record<string, any> | null }) {
  const allKeys = [...new Set([...Object.keys(oldVal ?? {}), ...Object.keys(newVal ?? {})])];
  if (!allKeys.length) return <p className="text-xs text-muted-foreground">Nessun dato disponibile</p>;

  return (
    <div className="grid grid-cols-2 gap-px bg-border rounded-lg overflow-hidden text-xs font-mono">
      <div className="bg-destructive/5 p-3 space-y-1">
        <p className="font-sans font-medium text-destructive mb-2">Vecchi valori</p>
        {allKeys.map((k) => {
          const old = oldVal?.[k];
          const nw = newVal?.[k];
          const changed = JSON.stringify(old) !== JSON.stringify(nw);
          return (
            <div key={k} className={cn("px-1.5 py-0.5 rounded", changed && "bg-destructive/10")}>
              <span className="text-muted-foreground">{k}: </span>
              <span>{old !== undefined ? JSON.stringify(old) : "—"}</span>
            </div>
          );
        })}
      </div>
      <div className="bg-emerald-500/5 p-3 space-y-1">
        <p className="font-sans font-medium text-emerald-700 mb-2">Nuovi valori</p>
        {allKeys.map((k) => {
          const old = oldVal?.[k];
          const nw = newVal?.[k];
          const changed = JSON.stringify(old) !== JSON.stringify(nw);
          return (
            <div key={k} className={cn("px-1.5 py-0.5 rounded", changed && "bg-emerald-500/10")}>
              <span className="text-muted-foreground">{k}: </span>
              <span>{nw !== undefined ? JSON.stringify(nw) : "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function SuperadminAuditLog() {
  // Filters
  const [tenantFilter, setTenantFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");
  const [ioOnly, setIoOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Fetch tenants for filter dropdown
  const { data: tenants } = useQuery({
    queryKey: ["sa-audit-tenants"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name").order("name");
      return data ?? [];
    },
  });

  // Fetch audit logs
  const { data, isLoading } = useQuery({
    queryKey: ["sa-audit-logs", tenantFilter, actionFilter, entityFilter, userSearch, ioOnly, dateFrom?.toISOString(), dateTo?.toISOString(), page],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (tenantFilter !== "all") query = query.eq("tenant_id", tenantFilter);
      if (actionFilter !== "all") query = query.eq("action", actionFilter);
      if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
      if (ioOnly) query = query.not("modified_for_user_id", "is", null);
      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) query = query.lte("created_at", dateTo.toISOString());

      const { data: logs, count, error } = await query;
      if (error) throw error;

      // Fetch user & tenant names
      const userIds = [...new Set((logs ?? []).flatMap((l) => [l.user_id, l.modified_for_user_id].filter(Boolean)))];
      const tenantIds = [...new Set((logs ?? []).map((l) => l.tenant_id))];

      const [usersRes, tenantsRes] = await Promise.all([
        userIds.length ? supabase.from("users").select("id, full_name").in("id", userIds) : { data: [] },
        tenantIds.length ? supabase.from("tenants").select("id, name").in("id", tenantIds) : { data: [] },
      ]);

      const userMap = new Map((usersRes.data ?? []).map((u) => [u.id, u.full_name]));
      const tenantMap = new Map((tenantsRes.data ?? []).map((t) => [t.id, t.name]));

      // Filter by user search (client-side since we need the join)
      let enriched = (logs ?? []).map((l) => ({
        ...l,
        userName: userMap.get(l.user_id) ?? "—",
        modifiedForName: l.modified_for_user_id ? (userMap.get(l.modified_for_user_id) ?? "—") : null,
        tenantName: tenantMap.get(l.tenant_id) ?? "—",
      }));

      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase();
        enriched = enriched.filter((l) => l.userName.toLowerCase().includes(q));
      }

      return { logs: enriched, total: count ?? 0 };
    },
  });

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  // CSV export
  const exportCsv = useCallback(async () => {
    let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(10000);
    if (tenantFilter !== "all") query = query.eq("tenant_id", tenantFilter);
    if (actionFilter !== "all") query = query.eq("action", actionFilter);
    if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
    if (ioOnly) query = query.not("modified_for_user_id", "is", null);
    if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
    if (dateTo) query = query.lte("created_at", dateTo.toISOString());

    const { data: logs } = await query;
    if (!logs?.length) return;

    const rows = ["Data,Tenant ID,Azione,Entita,Entity ID,User ID,Modified For,IP"];
    for (const l of logs) {
      rows.push(`"${l.created_at}","${l.tenant_id}","${l.action}","${l.entity_type}","${l.entity_id}","${l.user_id}","${l.modified_for_user_id ?? ""}","${l.ip_address ?? ""}"`);
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tenantFilter, actionFilter, entityFilter, ioOnly, dateFrom, dateTo]);

  // Unique entity types for filter
  const entityTypes = useMemo(() => Object.entries(entityLabels), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Audit Log Globale</h1>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-1.5" />
          Esporta CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="sticky top-14 z-10 bg-background border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtri
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {/* Tenant */}
          <Select value={tenantFilter} onValueChange={(v) => { setTenantFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Tenant" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i tenant</SelectItem>
              {tenants?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Action */}
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Azione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le azioni</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
            </SelectContent>
          </Select>

          {/* Entity */}
          <Select value={entityFilter} onValueChange={(v) => { setEntityFilter(v); setPage(0); }}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Entità" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le entità</SelectItem>
              {entityTypes.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* User search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={userSearch}
              onChange={(e) => { setUserSearch(e.target.value); setPage(0); }}
              placeholder="Cerca utente..."
              className="pl-8 h-9 text-xs"
            />
          </div>

          {/* Date range */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs justify-start font-normal">
                {dateFrom && dateTo
                  ? `${format(dateFrom, "dd/MM/yy")} – ${format(dateTo, "dd/MM/yy")}`
                  : "Periodo..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 space-y-2" align="start">
              <div className="flex gap-3">
                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">Da</p>
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setPage(0); }} locale={it} className="p-2 pointer-events-auto" />
                </div>
                <div>
                  <p className="text-xs font-medium mb-1 text-muted-foreground">A</p>
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setPage(0); }} locale={it} className="p-2 pointer-events-auto" />
                </div>
              </div>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setPage(0); }}>
                  Cancella date
                </Button>
              )}
            </PopoverContent>
          </Popover>

          {/* IO only toggle */}
          <div className="flex items-center gap-2">
            <Switch id="io-toggle" checked={ioOnly} onCheckedChange={(v) => { setIoOnly(v); setPage(0); }} />
            <Label htmlFor="io-toggle" className="text-xs cursor-pointer">Solo modifiche IO</Label>
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[32px]" />
                  <TableHead className="text-xs">Data/Ora</TableHead>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs">Azione</TableHead>
                  <TableHead className="text-xs">Entità</TableHead>
                  <TableHead className="text-xs">Modificato da</TableHead>
                  <TableHead className="text-xs">Dati di</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.logs.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      Nessun risultato trovato
                    </TableCell>
                  </TableRow>
                ) : data.logs.map((log) => {
                  const isOpen = expanded.has(log.id);
                  const isIoEdit = log.modified_for_user_id && log.modified_for_user_id !== log.user_id;

                  return (
                    <TableRow key={log.id} className="group">
                      <TableCell colSpan={7} className="p-0">
                        <button
                          className={cn(
                            "w-full flex items-center text-left hover:bg-muted/30 transition-colors",
                            isIoEdit && ioOnly && "border-l-2 border-l-blue-500",
                          )}
                          onClick={() => toggleExpand(log.id)}
                        >
                          <div className="w-[40px] flex items-center justify-center shrink-0 py-2.5">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 grid grid-cols-6 gap-1 items-center min-w-0">
                            <span className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(log.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
                            </span>
                            <span className="py-2.5 text-xs font-medium truncate">{log.tenantName}</span>
                            <span className="py-2.5">
                              <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", actionColors[log.action] ?? "bg-muted text-muted-foreground")}>
                                {log.action}
                              </span>
                            </span>
                            <span className="py-2.5 text-xs">{entityLabels[log.entity_type] ?? log.entity_type}</span>
                            <span className="py-2.5 text-xs truncate">{log.userName}</span>
                            <span className={cn("py-2.5 text-xs truncate", isIoEdit && "bg-yellow-500/15 text-yellow-800 px-1.5 rounded")}>
                              {log.modifiedForName ?? "—"}
                            </span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="bg-muted/20 border-t border-border px-12 py-4 space-y-3">
                            <div className="flex flex-wrap gap-4 text-xs">
                              <div>
                                <span className="text-muted-foreground">Entity ID: </span>
                                <span className="font-mono">{log.entity_id}</span>
                              </div>
                              {log.ip_address && (
                                <div>
                                  <span className="text-muted-foreground">IP: </span>
                                  <span className="font-mono">{log.ip_address}</span>
                                </div>
                              )}
                            </div>
                            <JsonDiff
                              oldVal={log.old_values as Record<string, any> | null}
                              newVal={log.new_values as Record<string, any> | null}
                            />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {Math.min(page * PAGE_SIZE + 1, data?.total ?? 0)}–{Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0)} di {data?.total ?? 0} risultati
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Precedente
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Successivo
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
