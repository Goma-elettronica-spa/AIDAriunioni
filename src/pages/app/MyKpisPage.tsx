import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkline } from "@/components/ui/sparkline";
import {
  ArrowUp,
  ArrowDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

interface KpiDef {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  target_value: number | null;
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

interface Commitment {
  id: string;
  description: string;
  status: string;
  type: string;
  meeting_date: string;
}

function formatNumber(v: number, unit: string): string {
  if (unit === "%" || unit === "percent") return `${v.toLocaleString("it-IT")}%`;
  if (unit === "EUR" || unit === "eur") return `${v.toLocaleString("it-IT")} €`;
  return v.toLocaleString("it-IT");
}

function LargeChart({
  entries,
  targetValue,
  width = 500,
  height = 200,
}: {
  entries: KpiEntryWithMeeting[];
  targetValue: number | null;
  width?: number;
  height?: number;
}) {
  if (!entries.length) return null;

  const padding = { top: 16, right: 16, bottom: 32, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = entries.map((e) => e.current_value);
  const allValues = targetValue != null ? [...values, targetValue] : values;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const points = entries.map((e, i) => {
    const x = padding.left + (entries.length === 1 ? innerW / 2 : (i / (entries.length - 1)) * innerW);
    const y = padding.top + innerH - ((e.current_value - min) / range) * innerH;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const targetY =
    targetValue != null
      ? padding.top + innerH - ((targetValue - min) / range) * innerH
      : null;

  const labelInterval = Math.max(1, Math.floor(entries.length / 6));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-[500px]"
      fill="none"
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padding.top + innerH - frac * innerH;
        const val = min + frac * range;
        return (
          <g key={frac}>
            <line
              x1={padding.left}
              y1={y}
              x2={padding.left + innerW}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={0.5}
            />
            <text
              x={padding.left - 6}
              y={y + 3}
              textAnchor="end"
              fill="currentColor"
              fillOpacity={0.4}
              fontSize={9}
              fontFamily="monospace"
            >
              {Math.round(val).toLocaleString("it-IT")}
            </text>
          </g>
        );
      })}

      {/* Target line */}
      {targetY != null && (
        <>
          <line
            x1={padding.left}
            y1={targetY}
            x2={padding.left + innerW}
            y2={targetY}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeWidth={1}
            strokeDasharray="6 4"
          />
          <text
            x={padding.left + innerW + 2}
            y={targetY + 3}
            fill="currentColor"
            fillOpacity={0.4}
            fontSize={8}
            fontFamily="monospace"
          >
            target
          </text>
        </>
      )}

      {/* Data line */}
      <polyline
        points={polylinePoints}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2.5}
          fill="currentColor"
        />
      ))}

      {/* X-axis labels */}
      {entries.map((e, i) => {
        if (i % labelInterval !== 0 && i !== entries.length - 1) return null;
        const x = points[i].x;
        const date = new Date(e.meeting_date);
        const label = date.toLocaleDateString("it-IT", {
          month: "short",
          year: "2-digit",
        });
        return (
          <text
            key={i}
            x={x}
            y={height - 4}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.4}
            fontSize={8}
            fontFamily="monospace"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
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

function KpiCard({
  kpi,
  entries,
  varianceMap,
  expanded,
  onToggle,
}: {
  kpi: KpiDef;
  entries: KpiEntryWithMeeting[];
  varianceMap: Map<string, VarianceExplanation[]>;
  expanded: boolean;
  onToggle: () => void;
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

  return (
    <div>
      <Card
        className="border border-border cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-sm text-muted-foreground">
                {kpi.name} ({kpi.unit})
              </p>
              {kpi.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {kpi.description}
                </p>
              )}
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
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
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
            <div className="mb-4">
              <LargeChart
                entries={entries.slice().reverse()}
                targetValue={kpi.target_value}
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Riunione</TableHead>
                    <TableHead className="text-right">Valore</TableHead>
                    <TableHead className="text-right">Precedente</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead className="text-right">Delta%</TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const explanations = varianceMap.get(entry.id) ?? [];
                    return (
                      <TableRow key={entry.id} className="group">
                        <TableCell>
                          <div>
                            <span className="text-sm">
                              {entry.meeting_title ||
                                new Date(entry.meeting_date).toLocaleDateString("it-IT", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {new Date(entry.meeting_date).toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "long",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          {explanations.length > 0 && (
                            <div className="mt-1 space-y-0.5 pl-3 border-l border-border">
                              {explanations.map((exp) => (
                                <p
                                  key={exp.id}
                                  className="text-xs text-muted-foreground"
                                >
                                  Causa: {exp.reason}
                                  {exp.delta_portion != null && (
                                    <span>
                                      {" "}
                                      &mdash; {exp.delta_portion > 0 ? "+" : ""}
                                      {exp.delta_portion.toLocaleString("it-IT")} ({exp.direction})
                                    </span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(entry.current_value, kpi.unit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {entry.previous_value != null
                            ? formatNumber(entry.previous_value, kpi.unit)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {entry.delta != null ? (
                            <span
                              className={
                                entry.is_improved === true
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }
                            >
                              {entry.delta > 0 ? "+" : ""}
                              {entry.delta.toLocaleString("it-IT")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {entry.delta_percent != null ? (
                            <span
                              className={
                                entry.is_improved === true
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }
                            >
                              {entry.delta_percent > 0 ? "+" : ""}
                              {entry.delta_percent.toFixed(1)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.is_improved === true ? (
                            <Badge variant="secondary" className="text-emerald-600 text-xs">
                              <ArrowUp className="h-3 w-3 mr-0.5" />
                              Migliorato
                            </Badge>
                          ) : entry.is_improved === false ? (
                            <Badge variant="secondary" className="text-red-600 text-xs">
                              <ArrowDown className="h-3 w-3 mr-0.5" />
                              Peggiorato
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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

const commitmentStatusConfig: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  pending: { label: "In attesa", variant: "secondary" },
  in_progress: { label: "In corso", variant: "outline" },
};

export default function MyKpisPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const canSwitchUser = user?.role === "org_admin" || user?.role === "information_officer";

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [expandedKpiId, setExpandedKpiId] = useState<string | null>(null);

  const activeUserId = selectedUserId ?? user?.id ?? null;

  // Fetch users for the "view as" dropdown
  const tenantUsers = useQuery({
    queryKey: ["my-kpis-users", tenantId],
    enabled: !!tenantId && canSwitchUser,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, role")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch KPI definitions for selected user
  const kpiDefs = useQuery({
    queryKey: ["my-kpis-defs", activeUserId],
    enabled: !!activeUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, description, unit, direction, target_value")
        .eq("user_id", activeUserId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as KpiDef[];
    },
  });

  // Fetch all entries for all KPIs at once, joined with meetings
  const kpiEntries = useQuery({
    queryKey: ["my-kpis-entries", kpiDefs.data?.map((k) => k.id)],
    enabled: !!kpiDefs.data && kpiDefs.data.length > 0,
    queryFn: async () => {
      const kpiIds = kpiDefs.data!.map((k) => k.id);
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, previous_value, delta, delta_percent, is_improved, meeting_id, meetings(title, scheduled_date)")
        .in("kpi_id", kpiIds)
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

  // Fetch variance explanations for all entries
  const varianceExplanations = useQuery({
    queryKey: ["my-kpis-variances", kpiEntries.data?.map((e) => e.id)],
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

  // Fetch active commitments
  const commitments = useQuery({
    queryKey: ["my-kpis-commitments", activeUserId],
    enabled: !!activeUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitments")
        .select("id, description, status, type, meeting_id, meetings(scheduled_date)")
        .eq("user_id", activeUserId!)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        description: row.description,
        status: row.status,
        type: row.type,
        meeting_date: row.meetings?.scheduled_date ?? "",
      })) as Commitment[];
    },
  });

  // Group entries by kpi_id
  const entriesByKpi = useMemo(() => {
    const map = new Map<string, KpiEntryWithMeeting[]>();
    for (const entry of kpiEntries.data ?? []) {
      const list = map.get(entry.kpi_id) ?? [];
      list.push(entry);
      map.set(entry.kpi_id, list);
    }
    // Sort each by meeting_date DESC
    for (const [, list] of map) {
      list.sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
    }
    return map;
  }, [kpiEntries.data]);

  // Build variance map: entry_id -> explanations[]
  const varianceMap = useMemo(() => {
    const map = new Map<string, VarianceExplanation[]>();
    for (const v of varianceExplanations.data ?? []) {
      const list = map.get(v.kpi_entry_id) ?? [];
      list.push(v);
      map.set(v.kpi_entry_id, list);
    }
    return map;
  }, [varianceExplanations.data]);

  // Group commitments by type
  const monthlyCommitments = useMemo(
    () => (commitments.data ?? []).filter((c) => c.type === "monthly"),
    [commitments.data]
  );
  const quarterlyCommitments = useMemo(
    () => (commitments.data ?? []).filter((c) => c.type === "quarterly"),
    [commitments.data]
  );

  const isLoading = kpiDefs.isLoading || kpiEntries.isLoading;

  return (
    <div className="space-y-section-gap">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">I Miei KPI</h1>
        {canSwitchUser && tenantUsers.data && tenantUsers.data.length > 0 && (
          <Select
            value={activeUserId ?? ""}
            onValueChange={(val) => {
              setSelectedUserId(val);
              setExpandedKpiId(null);
            }}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Vedi come..." />
            </SelectTrigger>
            <SelectContent>
              {tenantUsers.data.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !kpiDefs.data?.length ? (
        <Card className="border border-dashed border-border">
          <CardContent className="p-8 text-center">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {kpiDefs.data.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              entries={entriesByKpi.get(kpi.id) ?? []}
              varianceMap={varianceMap}
              expanded={expandedKpiId === kpi.id}
              onToggle={() =>
                setExpandedKpiId(expandedKpiId === kpi.id ? null : kpi.id)
              }
            />
          ))}
        </div>
      )}

      {/* Commitments */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Impegni Attivi</h2>
        {commitments.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !commitments.data?.length ? (
          <p className="text-sm text-muted-foreground">Nessun impegno attivo</p>
        ) : (
          <div className="space-y-6">
            {monthlyCommitments.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Mensili
                </h3>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {monthlyCommitments.map((c) => {
                    const cfg = commitmentStatusConfig[c.status] ?? {
                      label: c.status,
                      variant: "secondary" as const,
                    };
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">{c.description}</p>
                          {c.meeting_date && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Riunione:{" "}
                              {new Date(c.meeting_date).toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                        <Badge variant={cfg.variant} className="text-xs shrink-0 ml-3">
                          {cfg.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {quarterlyCommitments.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Trimestrali
                </h3>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {quarterlyCommitments.map((c) => {
                    const cfg = commitmentStatusConfig[c.status] ?? {
                      label: c.status,
                      variant: "secondary" as const,
                    };
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">{c.description}</p>
                          {c.meeting_date && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Riunione:{" "}
                              {new Date(c.meeting_date).toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                        <Badge variant={cfg.variant} className="text-xs shrink-0 ml-3">
                          {cfg.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
