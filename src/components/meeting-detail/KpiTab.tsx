import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, BarChart3 } from "lucide-react";

interface Props {
  meetingId: string;
  tenantId: string;
}

interface KpiEntry {
  id: string;
  kpi_id: string;
  current_value: number;
  previous_value: number | null;
  delta: number | null;
  delta_percent: number | null;
  is_improved: boolean | null;
  user_id: string;
  kpi_name: string;
  kpi_unit: string;
  user_name: string;
  functional_area_id: string | null;
  functional_area_name: string | null;
  variances: { reason: string; delta_portion: number | null; direction: string }[];
}

export function KpiTab({ meetingId, tenantId }: Props) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());

  const kpiData = useQuery({
    queryKey: ["detail-kpi-grouped", meetingId, tenantId],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, previous_value, delta, delta_percent, is_improved, user_id")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      const kpiIds = [...new Set(entries.map((e) => e.kpi_id))];
      const userIds = [...new Set(entries.map((e) => e.user_id))];

      const [kpis, users, variances, userAreas, areas] = await Promise.all([
        kpiIds.length
          ? supabase.from("kpi_definitions").select("id, name, unit, functional_area_id").in("id", kpiIds)
          : { data: [] },
        userIds.length
          ? supabase.from("users").select("id, full_name").in("id", userIds)
          : { data: [] },
        entries.length
          ? supabase
              .from("kpi_variance_explanations")
              .select("kpi_entry_id, reason, delta_portion, direction")
              .in("kpi_entry_id", entries.map((e) => e.id))
          : { data: [] },
        userIds.length
          ? supabase.from("user_functional_areas").select("user_id, functional_area_id").in("user_id", userIds)
          : { data: [] },
        supabase.from("functional_areas").select("id, name").eq("tenant_id", tenantId).order("name"),
      ]);

      const kpiMap = new Map<string, { name: string; unit: string; functional_area_id: string | null }>();
      for (const k of kpis.data ?? []) kpiMap.set(k.id, { name: k.name, unit: k.unit, functional_area_id: k.functional_area_id });

      const userMap = new Map<string, string>();
      for (const u of users.data ?? []) userMap.set(u.id, u.full_name);

      const varianceMap = new Map<string, Array<{ reason: string; delta_portion: number | null; direction: string }>>();
      for (const v of variances.data ?? []) {
        if (!varianceMap.has(v.kpi_entry_id)) varianceMap.set(v.kpi_entry_id, []);
        varianceMap.get(v.kpi_entry_id)!.push(v);
      }

      // User → area mapping
      const userAreaMap = new Map<string, string>();
      for (const ua of userAreas.data ?? []) {
        userAreaMap.set(ua.user_id, ua.functional_area_id);
      }

      const areaNameMap = new Map<string, string>();
      for (const a of areas.data ?? []) areaNameMap.set(a.id, a.name);

      const enriched: KpiEntry[] = entries.map((e) => {
        const kpi = kpiMap.get(e.kpi_id);
        const userAreaId = userAreaMap.get(e.user_id) ?? kpi?.functional_area_id ?? null;
        return {
          ...e,
          kpi_name: kpi?.name ?? "—",
          kpi_unit: kpi?.unit ?? "",
          user_name: userMap.get(e.user_id) ?? "—",
          functional_area_id: userAreaId,
          functional_area_name: userAreaId ? (areaNameMap.get(userAreaId) ?? "Altro") : null,
          variances: varianceMap.get(e.id) ?? [],
        };
      });

      // Group by area
      const grouped = new Map<string, KpiEntry[]>();
      for (const e of enriched) {
        const areaKey = e.functional_area_name ?? "Senza Area";
        if (!grouped.has(areaKey)) grouped.set(areaKey, []);
        grouped.get(areaKey)!.push(e);
      }

      // Sort areas alphabetically, "Senza Area" last
      const sortedAreas = [...grouped.entries()].sort((a, b) => {
        if (a[0] === "Senza Area") return 1;
        if (b[0] === "Senza Area") return -1;
        return a[0].localeCompare(b[0]);
      });

      return { areas: sortedAreas, areaNames: areas.data ?? [] };
    },
  });

  const toggleEntry = (id: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleArea = (areaName: string) => {
    setCollapsedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaName)) next.delete(areaName);
      else next.add(areaName);
      return next;
    });
  };

  if (kpiData.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!kpiData.data?.areas.length) {
    return (
      <div className="text-center py-16 border border-dashed border-border rounded-lg">
        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nessun dato KPI per questa riunione.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {kpiData.data.areas.map(([areaName, entries]) => {
        const isCollapsed = collapsedAreas.has(areaName);
        const improved = entries.filter((e) => e.is_improved === true).length;
        const declined = entries.filter((e) => e.is_improved === false).length;

        return (
          <div key={areaName}>
            {/* Area header */}
            <div
              className="flex items-center gap-2 mb-3 cursor-pointer select-none"
              onClick={() => toggleArea(areaName)}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <h3 className="text-sm font-semibold text-foreground">{areaName}</h3>
              <Badge variant="outline" className="text-[10px] font-mono">
                {entries.length} KPI
              </Badge>
              {improved > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1 inline-flex items-center">
                  <TrendingUp className="h-2.5 w-2.5" style={{ color: "hsl(var(--status-done))" }} />
                  {improved}
                </Badge>
              )}
              {declined > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1 inline-flex items-center">
                  <TrendingDown className="h-2.5 w-2.5" style={{ color: "hsl(var(--status-stuck))" }} />
                  {declined}
                </Badge>
              )}
            </div>

            {!isCollapsed && (
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-8" />
                      <TableHead>Dirigente</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead className="text-right">Valore</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Precedente</TableHead>
                      <TableHead className="text-right">Delta %</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const isExpanded = expandedEntries.has(entry.id);
                      const hasVariances = entry.variances.length > 0;
                      return (
                        <>
                          <TableRow
                            key={entry.id}
                            className={`hover:bg-muted/30 ${hasVariances ? "cursor-pointer" : ""}`}
                            onClick={() => hasVariances && toggleEntry(entry.id)}
                          >
                            <TableCell className="w-8 px-2">
                              {hasVariances &&
                                (isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ))}
                            </TableCell>
                            <TableCell className="text-sm">{entry.user_name}</TableCell>
                            <TableCell>
                              <span className="text-sm font-medium">{entry.kpi_name}</span>
                              <Badge variant="outline" className="text-[10px] ml-1.5">{entry.kpi_unit}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {entry.current_value}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground hidden sm:table-cell">
                              {entry.previous_value ?? "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {entry.delta_percent !== null ? (
                                <span
                                  className="font-mono text-sm font-semibold"
                                  style={{
                                    color: entry.is_improved
                                      ? "hsl(var(--status-done))"
                                      : "hsl(var(--status-stuck))",
                                  }}
                                >
                                  {Number(entry.delta_percent) > 0 ? "+" : ""}
                                  {Number(entry.delta_percent).toFixed(1)}%
                                </span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="w-10">
                              {entry.is_improved !== null &&
                                (entry.is_improved ? (
                                  <TrendingUp className="h-4 w-4" style={{ color: "hsl(var(--status-done))" }} />
                                ) : (
                                  <TrendingDown className="h-4 w-4" style={{ color: "hsl(var(--status-stuck))" }} />
                                ))}
                            </TableCell>
                          </TableRow>
                          {isExpanded &&
                            entry.variances.map((v, vi) => (
                              <TableRow key={`${entry.id}-v-${vi}`} className="bg-muted/10">
                                <TableCell />
                                <TableCell colSpan={3} className="text-sm text-muted-foreground pl-8">
                                  {v.reason}
                                </TableCell>
                                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                  {v.delta_portion !== null ? (
                                    <span>
                                      {v.direction === "positive" ? "+" : "−"}
                                      {v.delta_portion}
                                    </span>
                                  ) : null}
                                </TableCell>
                                <TableCell colSpan={2} />
                              </TableRow>
                            ))}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
