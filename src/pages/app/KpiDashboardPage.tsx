import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkline } from "@/components/ui/sparkline";
import {
  ArrowUp,
  ArrowDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type FunctionalArea = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

const taskStatusConfig: Record<string, { label: string; colorClass: string; dotClass: string }> = {
  todo: { label: "Da fare", colorClass: "bg-gray-100 text-gray-700", dotClass: "bg-[hsl(var(--status-todo))]" },
  wip: { label: "In corso", colorClass: "bg-blue-100 text-blue-700", dotClass: "bg-[hsl(var(--status-wip))]" },
  stuck: { label: "Bloccato", colorClass: "bg-red-100 text-red-700", dotClass: "bg-[hsl(var(--status-stuck))]" },
  waiting_for: { label: "In attesa", colorClass: "bg-amber-100 text-amber-700", dotClass: "bg-[hsl(var(--status-waiting))]" },
};

function formatNumber(v: number, unit: string): string {
  if (unit === "%" || unit === "percent") return `${v.toLocaleString("it-IT")}%`;
  if (unit === "EUR" || unit === "eur") return `${v.toLocaleString("it-IT")} €`;
  return v.toLocaleString("it-IT");
}

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${className}`} />;
}

// ─── Section 1: KPI Aziendali (aggregate) ────────────────────────────────────

function AggregateKpiSection({ tenantId }: { tenantId: string }) {
  const aggregateKpis = useQuery({
    queryKey: ["kpi-dashboard-aggregate", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Get all KPI definitions for this tenant
      const { data: defs, error: defsErr } = await supabase
        .from("kpi_definitions")
        .select("id, name, unit")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (defsErr) throw defsErr;
      if (!defs?.length) return [];

      const kpiIds = defs.map((d) => d.id);

      // Get all entries for these KPIs
      const { data: entries, error: entriesErr } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, is_improved, meeting_id, meetings(scheduled_date)")
        .in("kpi_id", kpiIds)
        .order("meetings(scheduled_date)", { ascending: true });
      if (entriesErr) throw entriesErr;

      // Group by KPI name (aggregate across users with same KPI name)
      const defMap = new Map(defs.map((d) => [d.id, d]));
      const byName = new Map<string, { unit: string; values: number[] }>();

      for (const entry of entries ?? []) {
        const def = defMap.get(entry.kpi_id);
        if (!def) continue;
        const existing = byName.get(def.name) ?? { unit: def.unit, values: [] };
        existing.values.push(entry.current_value);
        byName.set(def.name, existing);
      }

      // For each unique KPI name, compute average and get sparkline values
      const entriesByName = new Map<string, { date: string; values: number[] }[]>();
      for (const entry of entries ?? []) {
        const def = defMap.get(entry.kpi_id);
        if (!def) continue;
        const meetingDate = (entry as any).meetings?.scheduled_date ?? "";
        const list = entriesByName.get(def.name) ?? [];
        // Find or create date bucket
        let bucket = list.find((b) => b.date === meetingDate);
        if (!bucket) {
          bucket = { date: meetingDate, values: [] };
          list.push(bucket);
        }
        bucket.values.push(entry.current_value);
        entriesByName.set(def.name, list);
      }

      const results: {
        name: string;
        unit: string;
        avgValue: number;
        sparklineValues: number[];
        totalEntries: number;
      }[] = [];

      for (const [name, data] of byName) {
        const allVals = data.values;
        const avg = allVals.reduce((a, b) => a + b, 0) / allVals.length;

        // Build sparkline: average per date bucket
        const dateBuckets = entriesByName.get(name) ?? [];
        dateBuckets.sort((a, b) => a.date.localeCompare(b.date));
        const sparklineValues = dateBuckets.map(
          (b) => b.values.reduce((a, c) => a + c, 0) / b.values.length
        );

        results.push({
          name,
          unit: data.unit,
          avgValue: avg,
          sparklineValues: sparklineValues.slice(-12),
          totalEntries: allVals.length,
        });
      }

      return results.sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-muted">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">KPI Aziendali</h2>
      </div>

      {aggregateKpis.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !aggregateKpis.data?.length ? (
        <Card className="border border-dashed border-border">
          <CardContent className="p-6 text-center py-8">
            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nessun KPI aziendale disponibile</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {aggregateKpis.data.map((kpi) => (
            <Card key={kpi.name} className="border border-border">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-muted-foreground truncate">{kpi.name}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">
                      {formatNumber(Math.round(kpi.avgValue * 100) / 100, kpi.unit)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Media su {kpi.totalEntries} rilevazioni
                    </p>
                  </div>
                  {kpi.sparklineValues.length > 1 && (
                    <div className="text-muted-foreground shrink-0 ml-3">
                      <Sparkline values={kpi.sparklineValues} width={120} height={32} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 2: KPI per Persona ──────────────────────────────────────────────

function KpiByUserSection({ tenantId }: { tenantId: string }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const tenantUsers = useQuery({
    queryKey: ["kpi-dashboard-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, role")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const userKpis = useQuery({
    queryKey: ["kpi-dashboard-user-kpis", selectedUserId],
    enabled: !!selectedUserId,
    queryFn: async () => {
      const { data: defs, error: defsErr } = await supabase
        .from("kpi_definitions")
        .select("id, name, unit, direction, target_value")
        .eq("user_id", selectedUserId)
        .eq("is_active", true)
        .order("name");
      if (defsErr) throw defsErr;
      if (!defs?.length) return [];

      const kpiIds = defs.map((d) => d.id);
      const { data: entries, error: entriesErr } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, delta, delta_percent, is_improved, meeting_id, meetings(scheduled_date)")
        .in("kpi_id", kpiIds)
        .order("meetings(scheduled_date)", { ascending: false });
      if (entriesErr) throw entriesErr;

      // Group entries by kpi_id and get latest + sparkline
      const entriesByKpi = new Map<string, any[]>();
      for (const e of entries ?? []) {
        const list = entriesByKpi.get(e.kpi_id) ?? [];
        list.push(e);
        entriesByKpi.set(e.kpi_id, list);
      }

      return defs.map((d) => {
        const kpiEntries = entriesByKpi.get(d.id) ?? [];
        const latest = kpiEntries[0] ?? null;
        const sparkValues = kpiEntries
          .slice()
          .reverse()
          .slice(-12)
          .map((e: any) => e.current_value);
        return {
          ...d,
          latest,
          sparkValues,
        };
      });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-muted">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">KPI per Persona</h2>
        </div>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Seleziona utente..." />
          </SelectTrigger>
          <SelectContent>
            {(tenantUsers.data ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedUserId ? (
        <Card className="border border-dashed border-border">
          <CardContent className="p-6 text-center py-8">
            <p className="text-sm text-muted-foreground">
              Seleziona un utente per visualizzare i suoi KPI
            </p>
          </CardContent>
        </Card>
      ) : userKpis.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !userKpis.data?.length ? (
        <Card className="border border-dashed border-border">
          <CardContent className="p-6 text-center py-8">
            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nessun KPI per questo utente</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {userKpis.data.map((kpi) => {
            const latest = kpi.latest;
            const improved = latest?.is_improved === true;
            const colorClass = improved ? "text-emerald-600" : "text-red-600";
            const DeltaIcon = improved ? ArrowUp : ArrowDown;
            return (
              <Card key={kpi.id} className="border border-border">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted-foreground truncate">
                        {kpi.name} ({kpi.unit})
                      </p>
                      {latest ? (
                        <p className="text-2xl font-bold text-foreground mt-1">
                          {formatNumber(latest.current_value, kpi.unit)}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1">Nessun dato</p>
                      )}
                    </div>
                    {kpi.sparkValues.length > 1 && (
                      <div className="text-muted-foreground shrink-0 ml-3">
                        <Sparkline values={kpi.sparkValues} width={120} height={32} />
                      </div>
                    )}
                  </div>
                  {latest?.delta != null && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass}`}>
                        <DeltaIcon className="h-3 w-3" />
                        {latest.delta > 0 ? "+" : ""}
                        {latest.delta.toLocaleString("it-IT")}
                        {latest.delta_percent != null && (
                          <span className="ml-0.5">
                            ({latest.delta_percent > 0 ? "+" : ""}
                            {latest.delta_percent.toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: KPI per Area Funzionale ──────────────────────────────────────

function KpiByAreaSection({ tenantId }: { tenantId: string }) {
  const areasQuery = useQuery({
    queryKey: ["kpi-dashboard-areas", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("functional_areas")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as FunctionalArea[];
    },
  });

  const usersWithKpis = useQuery({
    queryKey: ["kpi-dashboard-area-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Get all users with their functional_area_id
      const { data: users, error: usersErr } = await (supabase.from as any)("users")
        .select("id, full_name, functional_area_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");
      if (usersErr) throw usersErr;
      if (!users?.length) return [];

      const userIds = users.map((u: any) => u.id);

      // Get KPI definitions for all users
      const { data: defs, error: defsErr } = await supabase
        .from("kpi_definitions")
        .select("id, name, unit, user_id")
        .in("user_id", userIds)
        .eq("is_active", true);
      if (defsErr) throw defsErr;
      if (!defs?.length) return users.map((u: any) => ({ ...u, kpis: [] }));

      const kpiIds = defs.map((d) => d.id);

      // Get latest entries
      const { data: entries, error: entriesErr } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, delta, delta_percent, is_improved, meeting_id, meetings(scheduled_date)")
        .in("kpi_id", kpiIds)
        .order("meetings(scheduled_date)", { ascending: false });
      if (entriesErr) throw entriesErr;

      // Build latest entry per KPI
      const latestByKpi = new Map<string, any>();
      for (const e of entries ?? []) {
        if (!latestByKpi.has(e.kpi_id)) latestByKpi.set(e.kpi_id, e);
      }

      // Build sparkline per KPI
      const sparkByKpi = new Map<string, number[]>();
      for (const e of entries ?? []) {
        const list = sparkByKpi.get(e.kpi_id) ?? [];
        list.push(e.current_value);
        sparkByKpi.set(e.kpi_id, list);
      }

      // Build per-user data
      const defsByUser = new Map<string, typeof defs>();
      for (const d of defs ?? []) {
        const list = defsByUser.get(d.user_id) ?? [];
        list.push(d);
        defsByUser.set(d.user_id, list);
      }

      return users.map((u: any) => {
        const userDefs = defsByUser.get(u.id) ?? [];
        const kpis = userDefs.map((d) => {
          const latest = latestByKpi.get(d.id);
          const sparkVals = (sparkByKpi.get(d.id) ?? []).slice().reverse().slice(-12);
          return {
            id: d.id,
            name: d.name,
            unit: d.unit,
            latest,
            sparkValues: sparkVals,
          };
        });
        return {
          id: u.id,
          full_name: u.full_name,
          functional_area_id: u.functional_area_id,
          kpis,
        };
      });
    },
  });

  const areas = areasQuery.data ?? [];
  const users = usersWithKpis.data ?? [];

  // Group users by area
  const usersByArea = useMemo(() => {
    const map = new Map<string | null, typeof users>();
    for (const u of users) {
      const areaId = u.functional_area_id ?? null;
      const list = map.get(areaId) ?? [];
      list.push(u);
      map.set(areaId, list);
    }
    return map;
  }, [users]);

  const areaIds = areas.map((a) => a.id);
  const unassignedUsers = usersByArea.get(null) ?? [];

  if (areasQuery.isLoading || usersWithKpis.isLoading) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-md bg-muted">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">KPI per Area Funzionale</h2>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const allAreaGroups = [
    ...areas.map((a) => ({ id: a.id, name: a.name, users: usersByArea.get(a.id) ?? [] })),
    ...(unassignedUsers.length > 0
      ? [{ id: "__unassigned__", name: "Non assegnato", users: unassignedUsers }]
      : []),
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-muted">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">KPI per Area Funzionale</h2>
      </div>

      {allAreaGroups.length === 0 ? (
        <Card className="border border-dashed border-border">
          <CardContent className="p-6 text-center py-8">
            <p className="text-sm text-muted-foreground">Nessuna area funzionale configurata</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {allAreaGroups.map((group) => (
            <Card key={group.id} className="border border-border">
              <CardHeader className="p-6 pb-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={group.id === "__unassigned__" ? "outline" : "secondary"}
                    className="inline-flex items-center text-xs"
                  >
                    {group.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {group.users.length} {group.users.length === 1 ? "utente" : "utenti"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                {group.users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessun utente in quest'area</p>
                ) : (
                  <div className="space-y-4">
                    {group.users.map((u) => (
                      <div key={u.id}>
                        <p className="text-sm font-medium text-foreground mb-2">{u.full_name}</p>
                        {u.kpis.length === 0 ? (
                          <p className="text-xs text-muted-foreground ml-4">Nessun KPI</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ml-4">
                            {u.kpis.map((kpi: any) => {
                              const latest = kpi.latest;
                              const improved = latest?.is_improved === true;
                              return (
                                <div
                                  key={kpi.id}
                                  className="flex items-center justify-between border border-border rounded-lg p-3"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs text-muted-foreground truncate">
                                      {kpi.name}
                                    </p>
                                    {latest ? (
                                      <p className="text-sm font-semibold text-foreground">
                                        {formatNumber(latest.current_value, kpi.unit)}
                                      </p>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">—</p>
                                    )}
                                  </div>
                                  {kpi.sparkValues.length > 1 && (
                                    <div className="text-muted-foreground shrink-0 ml-2">
                                      <Sparkline
                                        values={kpi.sparkValues}
                                        width={80}
                                        height={24}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 4: Task in Ritardo ──────────────────────────────────────────────

function OverdueTasksSection({ tenantId }: { tenantId: string }) {
  const today = new Date().toISOString().split("T")[0];

  const overdueTasks = useQuery({
    queryKey: ["kpi-dashboard-overdue", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_tasks")
        .select("id, title, status, deadline_date, owner_user_id")
        .eq("tenant_id", tenantId)
        .neq("status", "done")
        .lt("deadline_date", today)
        .order("deadline_date", { ascending: true });
      if (error) throw error;
      if (!data?.length) return [];

      const ownerIds = [...new Set(data.map((t) => t.owner_user_id))];
      const { data: owners } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", ownerIds);
      const ownerMap = new Map(owners?.map((o) => [o.id, o.full_name]) ?? []);

      return data.map((t) => {
        const deadlineDate = new Date(t.deadline_date);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        deadlineDate.setHours(0, 0, 0, 0);
        const daysOverdue = Math.floor(
          (todayDate.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          ...t,
          owner_name: ownerMap.get(t.owner_user_id) ?? "—",
          days_overdue: daysOverdue,
        };
      }).sort((a, b) => b.days_overdue - a.days_overdue);
    },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-muted">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Task in Ritardo</h2>
        {overdueTasks.data && overdueTasks.data.length > 0 && (
          <Badge variant="destructive" className="inline-flex items-center text-xs">
            {overdueTasks.data.length}
          </Badge>
        )}
      </div>

      {overdueTasks.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !overdueTasks.data?.length ? (
        <Card className="border border-border">
          <CardContent className="p-6 text-center py-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Nessun task in ritardo</p>
            <p className="text-xs text-muted-foreground mt-1">Tutti i task sono nei tempi previsti</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-border">
          <CardContent className="p-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-3 px-4">Titolo</TableHead>
                    <TableHead className="py-3 px-4">Owner</TableHead>
                    <TableHead className="py-3 px-4">Scadenza</TableHead>
                    <TableHead className="py-3 px-4 text-center">Giorni di Ritardo</TableHead>
                    <TableHead className="py-3 px-4">Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueTasks.data.map((task) => {
                    const status = taskStatusConfig[task.status] ?? {
                      label: task.status,
                      colorClass: "bg-gray-100 text-gray-700",
                      dotClass: "bg-muted-foreground",
                    };
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="py-3 px-4">
                          <span className="text-sm font-medium text-foreground">{task.title}</span>
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <span className="text-sm text-muted-foreground">{task.owner_name}</span>
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <span className="text-sm text-muted-foreground font-mono">
                            {new Date(task.deadline_date).toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <Badge
                            variant="destructive"
                            className="inline-flex items-center text-xs font-mono"
                          >
                            {task.days_overdue}g
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 px-4">
                          <Badge
                            variant="secondary"
                            className={`inline-flex items-center gap-1.5 text-xs ${status.colorClass}`}
                          >
                            <StatusDot className={status.dotClass} />
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function KpiDashboardPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  return (
    <div className="space-y-section-gap">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">KPI Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Panoramica dei KPI aziendali, per persona e per area funzionale
        </p>
      </div>

      {tenantId && (
        <>
          <AggregateKpiSection tenantId={tenantId} />
          <KpiByUserSection tenantId={tenantId} />
          <KpiByAreaSection tenantId={tenantId} />
          <OverdueTasksSection tenantId={tenantId} />
        </>
      )}
    </div>
  );
}
