import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

const actionConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  create: { label: "Creazione", variant: "default" },
  update: { label: "Modifica", variant: "secondary" },
  delete: { label: "Eliminazione", variant: "destructive" },
};

const entityLabels: Record<string, string> = {
  kpi_entry: "Valore KPI",
  highlight: "Highlight",
  commitment: "Impegno",
  board_task: "Task",
  slide_upload: "Slide",
  meeting: "Riunione",
  user: "Utente",
  kpi_definition: "KPI",
  meeting_brief: "Brief",
  suggested_task: "Task Suggerito",
  meeting_summary: "Riassunto",
  summary_shared: "Condivisione Riassunto",
  join_request: "Richiesta Accesso",
  functional_area: "Area Funzionale",
  board_role: "Ruolo Board",
  pre_meeting_submission: "Pre-Meeting Inviato",
};

const entityFilterOptions = [
  { value: "all", label: "Tutti" },
  { value: "kpi_entry", label: "Valore KPI" },
  { value: "highlight", label: "Highlight" },
  { value: "commitment", label: "Impegno" },
  { value: "board_task", label: "Task" },
  { value: "user", label: "Utente" },
  { value: "kpi_definition", label: "KPI" },
  { value: "meeting", label: "Riunione" },
  { value: "suggested_task", label: "Task Suggerito" },
  { value: "meeting_summary", label: "Riassunto" },
  { value: "summary_shared", label: "Condivisione Riassunto" },
  { value: "join_request", label: "Richiesta Accesso" },
  { value: "functional_area", label: "Area Funzionale" },
  { value: "board_role", label: "Ruolo Board" },
];

const fieldLabels: Record<string, string> = {
  full_name: "Nome completo",
  email: "Email",
  role: "Ruolo",
  is_active: "Attivo",
  is_required: "Obbligatorio",
  name: "Nome",
  unit: "Unita'",
  direction: "Direzione",
  target_value: "Valore target",
  status: "Stato",
  title: "Titolo",
  description: "Descrizione",
  scheduled_date: "Data programmata",
  summary_text: "Testo riassunto",
  shared_with_count: "Condiviso con",
  suggested_role: "Ruolo suggerito",
  assigned_to: "Assegnato a",
  board_role_id: "Ruolo board",
  owner_user_id: "Owner",
  deadline_type: "Tipo scadenza",
  functional_area_id: "Area funzionale",
  current_value: "Valore attuale",
};

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Si'" : "No";
  return String(value);
}

function DiffView({ oldValues, newValues }: { oldValues: Record<string, any> | null; newValues: Record<string, any> | null }) {
  const allKeys = new Set([
    ...Object.keys(oldValues ?? {}),
    ...Object.keys(newValues ?? {}),
  ]);

  return (
    <div className="space-y-1.5">
      {[...allKeys].map((key) => {
        const oldVal = oldValues?.[key];
        const newVal = newValues?.[key];
        const label = fieldLabels[key] ?? key;
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
        return (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="font-medium text-muted-foreground w-32 shrink-0">{label}</span>
            {oldVal !== undefined && (
              <span className={cn("px-1.5 py-0.5 rounded", changed ? "bg-destructive/10 line-through" : "bg-muted/30")}>
                {formatFieldValue(oldVal)}
              </span>
            )}
            {changed && oldVal !== undefined && newVal !== undefined && (
              <span className="text-muted-foreground">&rarr;</span>
            )}
            {newVal !== undefined && (
              <span className={cn("px-1.5 py-0.5 rounded", changed ? "bg-[hsl(var(--status-done)/0.1)] font-medium" : "bg-muted/30")}>
                {formatFieldValue(newVal)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [filterUser, setFilterUser] = useState("all");
  const [filterModifiedFor, setFilterModifiedFor] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");

  const tenantId = user?.tenant_id;

  const usersQuery = useQuery({
    queryKey: ["audit-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const logsQuery = useQuery({
    queryKey: ["audit-logs", tenantId, page, dateFrom?.toISOString(), dateTo?.toISOString(), filterUser, filterModifiedFor, filterEntity],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
      if (filterUser !== "all") query = query.eq("user_id", filterUser);
      if (filterModifiedFor !== "all") query = query.eq("modified_for_user_id", filterModifiedFor);
      if (filterEntity !== "all") query = query.eq("entity_type", filterEntity);

      const { data, error, count } = await query;
      if (error) throw error;

      // Also fetch unfiltered total count for debug info
      const { count: totalUnfiltered } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);

      return { rows: data ?? [], total: count ?? 0, totalUnfiltered: totalUnfiltered ?? 0 };
    },
  });

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usersQuery.data ?? []) m.set(u.id, u.full_name);
    return m;
  }, [usersQuery.data]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalPages = Math.ceil((logsQuery.data?.total ?? 0) / PAGE_SIZE);

  const exportCsv = () => {
    const rows = logsQuery.data?.rows ?? [];
    if (!rows.length) return;
    const headers = ["Data/Ora", "Azione", "Entità", "Modificato da", "Dati di", "Entity ID"];
    const csvRows = rows.map((r) => [
      format(new Date(r.created_at), "dd/MM/yyyy HH:mm:ss"),
      r.action,
      entityLabels[r.entity_type] ?? r.entity_type,
      userMap.get(r.user_id) ?? r.user_id,
      r.modified_for_user_id ? (userMap.get(r.modified_for_user_id) ?? r.modified_for_user_id) : "",
      r.entity_id,
    ]);
    const csv = [headers, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const DateFilter = ({ label, value, onChange }: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5 font-normal", !value && "text-muted-foreground")}>
          <CalendarIcon className="h-3 w-3" />
          {value ? format(value, "dd/MM/yy") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Audit Log</h1>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!logsQuery.data?.rows.length}>
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Esporta CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <DateFilter label="Da" value={dateFrom} onChange={(d) => { setDateFrom(d); setPage(0); }} />
        <DateFilter label="A" value={dateTo} onChange={(d) => { setDateTo(d); setPage(0); }} />

        <Select value={filterUser} onValueChange={(v) => { setFilterUser(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Modificato da" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli utenti</SelectItem>
            {usersQuery.data?.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterModifiedFor} onValueChange={(v) => { setFilterModifiedFor(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Dati di" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            {usersQuery.data?.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterEntity} onValueChange={(v) => { setFilterEntity(v); setPage(0); }}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Tipo entità" /></SelectTrigger>
          <SelectContent>
            {entityFilterOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {(dateFrom || dateTo || filterUser !== "all" || filterModifiedFor !== "all" || filterEntity !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setFilterUser("all"); setFilterModifiedFor("all"); setFilterEntity("all"); setPage(0); }}>
            Reset
          </Button>
        )}
      </div>

      {/* Table */}
      {logsQuery.isLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : logsQuery.isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-destructive font-medium">Errore nel caricamento dei log</p>
          <p className="text-xs text-muted-foreground">{(logsQuery.error as Error)?.message ?? "Errore sconosciuto"}</p>
        </div>
      ) : !logsQuery.data?.rows.length ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-muted-foreground">Nessun log trovato per i filtri selezionati.</p>
          {(logsQuery.data?.totalUnfiltered ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">Totale log nel sistema: {logsQuery.data?.totalUnfiltered}</p>
          )}
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-8" />
                  <TableHead className="text-xs">Data/Ora</TableHead>
                  <TableHead className="text-xs">Azione</TableHead>
                  <TableHead className="text-xs">Entità</TableHead>
                  <TableHead className="text-xs">Modificato da</TableHead>
                  <TableHead className="text-xs">Dati di</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsQuery.data.rows.map((log) => {
                  const isExpanded = expanded.has(log.id);
                  const ac = actionConfig[log.action] ?? { label: log.action, variant: "secondary" as const };
                  const modifierName = userMap.get(log.user_id) ?? "—";
                  const modifiedForName = log.modified_for_user_id ? (userMap.get(log.modified_for_user_id) ?? "—") : "—";
                  const isDifferentUser = log.modified_for_user_id && log.modified_for_user_id !== log.user_id;
                  const hasDetails = log.old_values || log.new_values;

                  return (
                    <>
                      <TableRow
                        key={log.id}
                        className={cn("hover:bg-muted/30", hasDetails && "cursor-pointer")}
                        onClick={() => hasDetails && toggleExpand(log.id)}
                      >
                        <TableCell className="w-8 px-2">
                          {hasDetails && (isExpanded
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={ac.variant} className="text-[10px]">{ac.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {entityLabels[log.entity_type] ?? log.entity_type}
                        </TableCell>
                        <TableCell className="text-xs">{modifierName}</TableCell>
                        <TableCell className="text-xs">
                          {isDifferentUser ? (
                            <span className="bg-[hsl(var(--status-waiting)/0.15)] text-foreground px-1.5 py-0.5 rounded text-[10px] font-medium">
                              {modifiedForName}
                            </span>
                          ) : modifiedForName}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${log.id}-detail`} className="bg-muted/10">
                          <TableCell />
                          <TableCell colSpan={5} className="py-3">
                            <DiffView
                              oldValues={log.old_values as Record<string, any> | null}
                              newValues={log.new_values as Record<string, any> | null}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {logsQuery.data.total} risultati — pagina {page + 1} di {totalPages}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className={cn(page === 0 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.min(Math.max(page - 2, 0), Math.max(totalPages - 5, 0)) + i;
                    if (pageNum >= totalPages) return null;
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink isActive={pageNum === page} onClick={() => setPage(pageNum)}>
                          {pageNum + 1}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      className={cn(page >= totalPages - 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}
