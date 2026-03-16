import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  meetingId: string;
  tenantId: string;
}

export function KpiTab({ meetingId, tenantId }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const kpiData = useQuery({
    queryKey: ["detail-kpi", meetingId],
    queryFn: async () => {
      const { data: entries, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, previous_value, delta, delta_percent, is_improved, user_id")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      const kpiIds = [...new Set(entries.map((e) => e.kpi_id))];
      const userIds = [...new Set(entries.map((e) => e.user_id))];

      const [kpis, users, variances] = await Promise.all([
        kpiIds.length
          ? supabase.from("kpi_definitions").select("id, name, unit").in("id", kpiIds)
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
      ]);

      const kpiMap = new Map(kpis.data?.map((k) => [k.id, k]) ?? []);
      const userMap = new Map(users.data?.map((u) => [u.id, u.full_name]) ?? []);
      const varianceMap = new Map<string, typeof variances.data>();
      for (const v of variances.data ?? []) {
        if (!varianceMap.has(v.kpi_entry_id)) varianceMap.set(v.kpi_entry_id, []);
        varianceMap.get(v.kpi_entry_id)!.push(v);
      }

      return entries.map((e) => ({
        ...e,
        kpi_name: kpiMap.get(e.kpi_id)?.name ?? "—",
        kpi_unit: kpiMap.get(e.kpi_id)?.unit ?? "",
        user_name: userMap.get(e.user_id) ?? "—",
        variances: varianceMap.get(e.id) ?? [],
      }));
    },
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (kpiData.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!kpiData.data?.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nessun dato KPI per questa riunione.</p>;
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-8" />
            <TableHead>Dirigente</TableHead>
            <TableHead>KPI</TableHead>
            <TableHead className="text-right">Valore</TableHead>
            <TableHead className="text-right hidden sm:table-cell">Precedente</TableHead>
            <TableHead className="text-right">Delta</TableHead>
            <TableHead className="text-right hidden sm:table-cell">Delta %</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {kpiData.data.map((entry) => {
            const isExpanded = expanded.has(entry.id);
            const hasVariances = entry.variances.length > 0;
            return (
              <>
                <TableRow
                  key={entry.id}
                  className={`hover:bg-muted/30 ${hasVariances ? "cursor-pointer" : ""}`}
                  onClick={() => hasVariances && toggleExpand(entry.id)}
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
                    {entry.delta !== null ? (
                      <span
                        className="font-mono text-sm font-medium"
                        style={{
                          color: entry.is_improved
                            ? "hsl(var(--status-done))"
                            : "hsl(var(--status-stuck))",
                        }}
                      >
                        {entry.delta > 0 ? "+" : ""}
                        {Number(entry.delta).toFixed(1)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground hidden sm:table-cell">
                    {entry.delta_percent !== null
                      ? `${Number(entry.delta_percent).toFixed(1)}%`
                      : "—"}
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
                      <TableCell colSpan={4} className="text-sm text-muted-foreground pl-8">
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
  );
}
