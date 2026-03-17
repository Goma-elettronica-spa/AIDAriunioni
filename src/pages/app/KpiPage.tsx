import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkline } from "@/components/ui/sparkline";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowUp,
  ArrowDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiDef {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  target_value: number | null;
  functional_area_id: string;
}

interface KpiEntryWithMeeting {
  id: string;
  kpi_id: string;
  current_value: number;
  previous_value: number | null;
  delta: number | null;
  delta_percent: number | null;
  is_improved: boolean | null;
  meeting_id: string;
  meeting_title: string;
  meeting_date: string;
}

interface VarianceExplanation {
  id: string;
  kpi_entry_id: string;
  reason: string;
  delta_portion: number | null;
  delta_portion_percent: number | null;
  direction: string;
}

interface AreaInfo {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(v: number, unit: string): string {
  if (unit === "%" || unit === "percent") return `${v.toLocaleString("it-IT")}%`;
  if (unit === "EUR" || unit === "eur") return `${v.toLocaleString("it-IT")} \u20ac`;
  return v.toLocaleString("it-IT");
}

const taskStatusConfig: Record<string, { label: string; colorClass: string; dotClass: string }> = {
  todo: { label: "Da fare", colorClass: "bg-gray-100 text-gray-700", dotClass: "bg-[hsl(var(--status-todo))]" },
  wip: { label: "In corso", colorClass: "bg-blue-100 text-blue-700", dotClass: "bg-[hsl(var(--status-wip))]" },
  stuck: { label: "Bloccato", colorClass: "bg-red-100 text-red-700", dotClass: "bg-[hsl(var(--status-stuck))]" },
  waiting_for: { label: "In attesa", colorClass: "bg-amber-100 text-amber-700", dotClass: "bg-[hsl(var(--status-waiting))]" },
};

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${className}`} />;
}

function DeltaBadge({
  delta,
  deltaPercent,
  isImproved,
}: {
  delta: number | null;
  deltaPercent: number | null;
  isImproved: boolean | null;
}) {
  if (delta == null) return null;
  const improved = isImproved === true;
  const colorClass = improved ? "text-emerald-600" : "text-red-600";
  const Icon = improved ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${colorClass}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? "+" : ""}
      {delta.toLocaleString("it-IT")}
      {deltaPercent != null && (
        <span className="ml-0.5">
          ({deltaPercent > 0 ? "+" : ""}
          {deltaPercent.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

// ─── KPI History Chart ───────────────────────────────────────────────────────

function KpiHistoryChart({
  entries,
  unit,
  targetValue,
}: {
  entries: KpiEntryWithMeeting[];
  unit: string;
  targetValue: number | null;
}) {
  const chartData = entries
    .slice()
    .reverse()
    .map((e) => ({
      date: new Date(e.meeting_date).toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
      }),
      value: e.current_value,
      fullDate: e.meeting_date,
    }));

  if (chartData.length === 0) return null;

  const allValues = chartData.map((d) => d.value);
  if (targetValue != null) allValues.push(targetValue);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.15 || 1;

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
          />
          <YAxis
            domain={[Math.floor(minVal - padding), Math.ceil(maxVal + padding)]}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            tickFormatter={(v: number) => formatNumber(v, unit)}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: number) => [formatNumber(value, unit), "Valore"]}
            labelFormatter={(label: string) => label}
          />
          {targetValue != null && (
            <ReferenceLine
              y={targetValue}
              stroke="hsl(var(--primary))"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `Obiettivo: ${formatNumber(targetValue, unit)}`,
                position: "insideTopRight",
                fill: "hsl(var(--primary))",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            dot={{ r: 4, fill: "hsl(var(--foreground))", stroke: "hsl(var(--background))", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "hsl(var(--foreground))" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}


function KpiCard({
  kpi,
  entries,
  varianceMap,
  expanded,
  onToggle,
  areaName,
}: {
  kpi: KpiDef;
  entries: KpiEntryWithMeeting[];
  varianceMap: Map<string, VarianceExplanation[]>;
  expanded: boolean;
  onToggle: () => void;
  areaName?: string;
}) {
  const latest = entries[0] ?? null;
  const sparkValues = entries
    .slice()
    .reverse()
    .slice(-12)
    .map((e) => e.current_value);

  const progressPercent =
    kpi.target_value != null && kpi.target_value > 0 && latest
      ? Math.min(100, Math.round((latest.current_value / kpi.target_value) * 100))
      : null;

  const last6 = entries.slice(0, 6);

  return (
    <div>
      <Card
        className="border border-border cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm text-muted-foreground">
                  {kpi.name} ({kpi.unit})
                </p>
                {areaName && (
                  <Badge variant="outline" className="inline-flex items-center text-[10px]">
                    {areaName}
                  </Badge>
                )}
              </div>
              {latest ? (
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatNumber(latest.current_value, kpi.unit)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Nessun dato</p>
              )}
            </div>
            {sparkValues.length > 1 && (
              <div className="text-muted-foreground">
                <Sparkline values={sparkValues} width={120} height={32} />
              </div>
            )}
          </div>

          {latest && (
            <div className="flex items-center gap-3 mt-2">
              <DeltaBadge
                delta={latest.delta}
                deltaPercent={latest.delta_percent}
                isImproved={latest.is_improved}
              />
            </div>
          )}

          {progressPercent != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Target: {formatNumber(kpi.target_value!, kpi.unit)}</span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {expanded && (
        <Card className="border border-border mt-2">
          <CardContent className="p-6">
            {kpi.description && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Descrizione
                </p>
                <p className="text-sm text-foreground">{kpi.description}</p>
              </div>
            )}

            {entries.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Storico
                </p>
                <KpiHistoryChart
                  entries={entries}
                  unit={kpi.unit}
                  targetValue={kpi.target_value}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Lightweight KPI card for Section 3 (per-user stacked) ───────────────────

function MiniKpiCard({
  kpi,
  expanded,
  onToggle,
}: {
  kpi: {
    id: string;
    name: string;
    description: string | null;
    unit: string;
    latest: any;
    sparkValues: number[];
    areaName?: string;
    targetValue?: number | null;
  };
  expanded: boolean;
  onToggle: () => void;
}) {
  const latest = kpi.latest;
  const improved = latest?.is_improved === true;
  const colorClass = improved ? "text-emerald-600" : "text-red-600";
  const DeltaIcon = improved ? ArrowUp : ArrowDown;

  return (
    <div>
      <Card
        className="border border-border cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground truncate">
                  {kpi.name} ({kpi.unit})
                </p>
                {kpi.areaName && (
                  <Badge variant="outline" className="inline-flex items-center text-[10px] shrink-0">
                    {kpi.areaName}
                  </Badge>
                )}
              </div>
              {latest ? (
                <p className="text-2xl font-bold text-foreground mt-1">
                  {formatNumber(latest.current_value, kpi.unit)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Nessun dato inserito</p>
              )}
              {kpi.targetValue != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Obiettivo: <span className="font-semibold text-foreground">{formatNumber(kpi.targetValue, kpi.unit)}</span>
                </p>
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
          {/* Progress bar towards target */}
          {kpi.targetValue != null && kpi.targetValue > 0 && latest && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Target: {formatNumber(kpi.targetValue, kpi.unit)}</span>
                <span className="font-mono">{Math.min(100, Math.round((latest.current_value / kpi.targetValue) * 100))}%</span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.round((latest.current_value / kpi.targetValue) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {expanded && kpi.description && (
        <Card className="border border-border mt-2">
          <CardContent className="p-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Descrizione
            </p>
            <p className="text-sm text-foreground">{kpi.description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Section 1: I tuoi KPI (personal, grouped by area) ───────────────────────

function PersonalKpiSection({ userId, tenantId }: { userId: string; tenantId: string }) {
  const [expandedKpiId, setExpandedKpiId] = useState<string | null>(null);

  // Fetch user's functional areas
  const userAreas = useQuery({
    queryKey: ["kpi-page-personal-areas", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("user_functional_areas")
        .select("functional_area_id, functional_areas(id, name)")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as { functional_area_id: string; functional_areas: { id: string; name: string } }[];
    },
  });

  const areaIds = useMemo(() => userAreas.data?.map((a) => a.functional_area_id) ?? [], [userAreas.data]);
  const areaMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of userAreas.data ?? []) {
      m.set(a.functional_area_id, a.functional_areas?.name ?? "");
    }
    return m;
  }, [userAreas.data]);

  const kpiDefs = useQuery({
    queryKey: ["kpi-page-personal-defs", userId, areaIds],
    enabled: areaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, description, unit, direction, target_value, functional_area_id")
        .in("functional_area_id", areaIds)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as KpiDef[];
    },
  });

  const kpiEntries = useQuery({
    queryKey: ["kpi-page-personal-entries", kpiDefs.data?.map((k) => k.id), userId],
    enabled: !!kpiDefs.data && kpiDefs.data.length > 0,
    queryFn: async () => {
      const kpiIds = kpiDefs.data!.map((k) => k.id);
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, previous_value, delta, delta_percent, is_improved, meeting_id, meetings(title, scheduled_date)")
        .in("kpi_id", kpiIds)
        .eq("user_id", userId)
        .order("meetings(scheduled_date)", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        kpi_id: row.kpi_id,
        current_value: row.current_value,
        previous_value: row.previous_value,
        delta: row.delta,
        delta_percent: row.delta_percent,
        is_improved: row.is_improved,
        meeting_id: row.meeting_id,
        meeting_title: row.meetings?.title ?? "",
        meeting_date: row.meetings?.scheduled_date ?? "",
      })) as KpiEntryWithMeeting[];
    },
  });

  const varianceExplanations = useQuery({
    queryKey: ["kpi-page-personal-variances", kpiEntries.data?.map((e) => e.id)],
    enabled: !!kpiEntries.data && kpiEntries.data.length > 0,
    queryFn: async () => {
      const entryIds = kpiEntries.data!.map((e) => e.id);
      const { data, error } = await supabase
        .from("kpi_variance_explanations")
        .select("id, kpi_entry_id, reason, delta_portion, delta_portion_percent, direction")
        .in("kpi_entry_id", entryIds);
      if (error) throw error;
      return (data ?? []) as VarianceExplanation[];
    },
  });

  const entriesByKpi = useMemo(() => {
    const map = new Map<string, KpiEntryWithMeeting[]>();
    for (const entry of kpiEntries.data ?? []) {
      const list = map.get(entry.kpi_id) ?? [];
      list.push(entry);
      map.set(entry.kpi_id, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
    }
    return map;
  }, [kpiEntries.data]);

  const varianceMap = useMemo(() => {
    const map = new Map<string, VarianceExplanation[]>();
    for (const v of varianceExplanations.data ?? []) {
      const list = map.get(v.kpi_entry_id) ?? [];
      list.push(v);
      map.set(v.kpi_entry_id, list);
    }
    return map;
  }, [varianceExplanations.data]);

  // Group KPIs by area
  const kpisByArea = useMemo(() => {
    const map = new Map<string, KpiDef[]>();
    for (const kpi of kpiDefs.data ?? []) {
      const list = map.get(kpi.functional_area_id) ?? [];
      list.push(kpi);
      map.set(kpi.functional_area_id, list);
    }
    return map;
  }, [kpiDefs.data]);

  const isLoading = userAreas.isLoading || kpiDefs.isLoading || kpiEntries.isLoading;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-muted">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">I tuoi KPI</h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !kpiDefs.data?.length ? (
        <Card className="border border-dashed border-border">
          <CardContent className="p-6 text-center py-8">
            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              Nessun KPI assegnato
            </p>
            <p className="text-xs text-muted-foreground">
              Contatta l'amministratore per configurare i tuoi KPI.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(kpisByArea.entries()).map(([areaId, areaKpis]) => (
            <div key={areaId}>
              <h3 className="text-sm font-bold text-foreground mb-3">
                <Badge variant="outline" className="inline-flex items-center text-xs">
                  {areaMap.get(areaId) ?? "Area"}
                </Badge>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {areaKpis.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    kpi={kpi}
                    entries={entriesByKpi.get(kpi.id) ?? []}
                    varianceMap={varianceMap}
                    expanded={expandedKpiId === kpi.id}
                    onToggle={() =>
                      setExpandedKpiId(expandedKpiId === kpi.id ? null : kpi.id)
                    }
                    areaName={areaMap.get(kpi.functional_area_id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 2: KPI Aziendali (aggregate, grouped by area) ───────────────────

function AggregateKpiSection({ tenantId }: { tenantId: string }) {
  const aggregateKpis = useQuery({
    queryKey: ["kpi-page-aggregate", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Fetch all areas
      const { data: areasData, error: areasErr } = await (supabase.from as any)("functional_areas")
        .select("id, name")
        .eq("tenant_id", tenantId);
      if (areasErr) throw areasErr;
      const areas = (areasData ?? []) as AreaInfo[];

      const { data: defs, error: defsErr } = await supabase
        .from("kpi_definitions")
        .select("id, name, unit, functional_area_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (defsErr) throw defsErr;
      if (!defs?.length) return [];

      const kpiIds = defs.map((d) => d.id);

      const { data: entries, error: entriesErr } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, is_improved, meeting_id, meetings(scheduled_date)")
        .in("kpi_id", kpiIds)
        .order("meetings(scheduled_date)", { ascending: true });
      if (entriesErr) throw entriesErr;

      const areaMap = new Map(areas.map((a) => [a.id, a.name]));
      const defMap = new Map(defs.map((d) => [d.id, d]));

      // Group by area, then by KPI name
      const byAreaKpi = new Map<string, Map<string, { unit: string; values: number[]; dateBuckets: Map<string, number[]> }>>();

      for (const entry of entries ?? []) {
        const def = defMap.get(entry.kpi_id);
        if (!def) continue;
        const areaId = (def as any).functional_area_id ?? "unknown";
        if (!byAreaKpi.has(areaId)) byAreaKpi.set(areaId, new Map());
        const areaKpis = byAreaKpi.get(areaId)!;
        if (!areaKpis.has(def.name)) areaKpis.set(def.name, { unit: def.unit, values: [], dateBuckets: new Map() });
        const kpiData = areaKpis.get(def.name)!;
        kpiData.values.push(entry.current_value);
        const meetingDate = (entry as any).meetings?.scheduled_date ?? "";
        if (!kpiData.dateBuckets.has(meetingDate)) kpiData.dateBuckets.set(meetingDate, []);
        kpiData.dateBuckets.get(meetingDate)!.push(entry.current_value);
      }

      const results: {
        areaId: string;
        areaName: string;
        kpis: {
          name: string;
          unit: string;
          avgValue: number;
          sparklineValues: number[];
          totalEntries: number;
        }[];
      }[] = [];

      for (const [areaId, areaKpis] of byAreaKpi) {
        const kpis: typeof results[0]["kpis"] = [];
        for (const [name, data] of areaKpis) {
          const avg = data.values.reduce((a, b) => a + b, 0) / data.values.length;
          const dateBuckets = Array.from(data.dateBuckets.entries())
            .sort(([a], [b]) => a.localeCompare(b));
          const sparklineValues = dateBuckets.map(
            ([, vals]) => vals.reduce((a, c) => a + c, 0) / vals.length
          ).slice(-12);

          kpis.push({
            name,
            unit: data.unit,
            avgValue: avg,
            sparklineValues,
            totalEntries: data.values.length,
          });
        }
        kpis.sort((a, b) => a.name.localeCompare(b.name));
        results.push({
          areaId,
          areaName: areaMap.get(areaId) ?? "Area",
          kpis,
        });
      }

      // Also add areas with defs but no entries yet
      for (const def of defs) {
        const areaId = (def as any).functional_area_id;
        if (!byAreaKpi.has(areaId)) {
          // area has defs but no entries -- skip (already empty)
        }
      }

      return results.sort((a, b) => a.areaName.localeCompare(b.areaName));
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
        <div className="space-y-6">
          {aggregateKpis.data.map((areaGroup) => (
            <div key={areaGroup.areaId}>
              <h3 className="text-sm font-bold text-foreground mb-3">
                <Badge variant="outline" className="inline-flex items-center text-xs">
                  {areaGroup.areaName}
                </Badge>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {areaGroup.kpis.map((kpi) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section 3: KPI per Persona (all users stacked, by area) ─────────────────

function AllUsersKpiSection({ tenantId }: { tenantId: string }) {
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  const allUsersKpis = useQuery({
    queryKey: ["kpi-page-all-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Fetch all areas
      const { data: areasData, error: areasErr } = await (supabase.from as any)("functional_areas")
        .select("id, name")
        .eq("tenant_id", tenantId);
      if (areasErr) throw areasErr;
      const areaMap = new Map<string, string>((areasData ?? []).map((a: any) => [a.id, a.name]));

      // Fetch user_functional_areas
      const { data: ufaData, error: ufaErr } = await (supabase.from as any)("user_functional_areas")
        .select("user_id, functional_area_id")
        .eq("tenant_id", tenantId);
      if (ufaErr) throw ufaErr;
      const userAreasMap = new Map<string, string[]>();
      for (const ufa of ufaData ?? []) {
        const list = userAreasMap.get(ufa.user_id) ?? [];
        list.push(ufa.functional_area_id);
        userAreasMap.set(ufa.user_id, list);
      }

      // Fetch all KPI definitions by area
      const { data: defs, error: defsErr } = await supabase
        .from("kpi_definitions")
        .select("id, name, description, unit, direction, target_value, functional_area_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (defsErr) throw defsErr;

      const kpiIds = (defs ?? []).map((d) => d.id);

      // Fetch all entries
      const { data: entries, error: entriesErr } = kpiIds.length > 0
        ? await supabase
            .from("kpi_entries")
            .select("id, kpi_id, user_id, current_value, delta, delta_percent, is_improved, meeting_id, meetings(scheduled_date)")
            .in("kpi_id", kpiIds)
            .order("meetings(scheduled_date)", { ascending: false })
        : { data: [], error: null };
      if (entriesErr) throw entriesErr;

      // Build entries by (kpi_id, user_id)
      const entriesByKpiUser = new Map<string, any[]>();
      for (const e of entries ?? []) {
        const key = `${e.kpi_id}:${e.user_id}`;
        const list = entriesByKpiUser.get(key) ?? [];
        list.push(e);
        entriesByKpiUser.set(key, list);
      }

      // Build KPI map by area
      const defsByArea = new Map<string, typeof defs>();
      for (const d of defs ?? []) {
        const areaId = (d as any).functional_area_id;
        const list = defsByArea.get(areaId) ?? [];
        list.push(d);
        defsByArea.set(areaId, list);
      }

      // Fetch all users
      const { data: allUsers } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");

      // Build result: per user, show their areas' KPIs with their entries
      const byUser = new Map<string, { userName: string; kpis: any[] }>();

      for (const u of allUsers ?? []) {
        const uAreas = userAreasMap.get(u.id) ?? [];
        const kpis: any[] = [];

        for (const areaId of uAreas) {
          const areaDefs = defsByArea.get(areaId) ?? [];
          for (const d of areaDefs) {
            const key = `${d.id}:${u.id}`;
            const kpiEntries = entriesByKpiUser.get(key) ?? [];
            const latest = kpiEntries[0] ?? null;
            const sparkValues = kpiEntries
              .slice()
              .reverse()
              .slice(-12)
              .map((e: any) => e.current_value);
            kpis.push({
              id: `${d.id}-${u.id}`,
              name: d.name,
              description: d.description,
              unit: d.unit,
              targetValue: (d as any).target_value ?? null,
              latest,
              sparkValues,
              areaName: areaMap.get(areaId) ?? "",
            });
          }
        }

        byUser.set(u.id, { userName: u.full_name, kpis });
      }

      return Array.from(byUser.entries())
        .map(([userId, data]) => ({
          userId,
          userName: data.userName,
          kpis: data.kpis,
        }))
        .sort((a, b) => a.userName.localeCompare(b.userName));
    },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-md bg-muted">
          <Users className="h-4 w-4 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">KPI per Persona</h2>
      </div>

      {allUsersKpis.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !allUsersKpis.data?.length ? (
        <Card className="border border-dashed border-border">
          <CardContent className="p-6 text-center py-8">
            <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nessun KPI disponibile</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {allUsersKpis.data.map((userGroup) => (
            <div key={userGroup.userId}>
              <h3 className="text-sm font-bold text-foreground mb-3">
                {userGroup.userName}
              </h3>
              {userGroup.kpis.length === 0 ? (
                <p className="text-xs text-muted-foreground ml-4">Nessun KPI</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {userGroup.kpis.map((kpi: any) => (
                    <MiniKpiCard
                      key={kpi.id}
                      kpi={kpi}
                      expanded={expandedCardId === kpi.id}
                      onToggle={() =>
                        setExpandedCardId(expandedCardId === kpi.id ? null : kpi.id)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
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
    queryKey: ["kpi-page-overdue", tenantId],
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

      return data
        .map((t) => {
          const deadlineDate = new Date(t.deadline_date);
          const todayDate = new Date();
          todayDate.setHours(0, 0, 0, 0);
          deadlineDate.setHours(0, 0, 0, 0);
          const daysOverdue = Math.floor(
            (todayDate.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            ...t,
            owner_name: ownerMap.get(t.owner_user_id) ?? "\u2014",
            days_overdue: daysOverdue,
          };
        })
        .sort((a, b) => b.days_overdue - a.days_overdue);
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

export default function KpiPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const userId = user?.id;
  const isAdmin = user?.role === "org_admin" || user?.role === "information_officer";
  const isDirigente = user?.role === "dirigente";

  return (
    <div className="space-y-section-gap">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">KPI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Panoramica dei tuoi KPI personali e aziendali
        </p>
      </div>

      {/* Section 1: Personal KPIs (always shown) */}
      {userId && tenantId && <PersonalKpiSection userId={userId} tenantId={tenantId} />}

      {/* Section 2: Aggregate KPIs */}
      {tenantId && <AggregateKpiSection tenantId={tenantId} />}

      {/* Section 3: KPI per Persona (org_admin / IO only) */}
      {tenantId && isAdmin && <AllUsersKpiSection tenantId={tenantId} />}

      {/* Section 4: Overdue tasks (org_admin / IO only) */}
      {tenantId && isAdmin && <OverdueTasksSection tenantId={tenantId} />}
    </div>
  );
}
