import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Plus, Trash2 } from "lucide-react";

interface Props {
  meetingId: string;
  previousMeetingId: string | null;
  userId: string;
  tenantId: string;
  readOnly: boolean;
  onSaved: () => void;
  onComplete: (complete: boolean) => void;
}

interface VarianceRow {
  reason: string;
  delta_portion: number;
  direction: "positive" | "negative";
}

interface KpiState {
  kpiId: string;
  name: string;
  unit: string;
  direction: string;
  targetValue: number | null;
  isRequired: boolean;
  currentValue: string;
  previousValue: number | null;
  entryId: string | null;
  variances: VarianceRow[];
  areaName: string;
  areaId: string;
}

export function KpiSection({
  meetingId, previousMeetingId, userId, tenantId, readOnly, onSaved, onComplete,
}: Props) {
  const [kpis, setKpis] = useState<KpiState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch user's functional areas
  const userAreas = useQuery({
    queryKey: ["kpi-user-areas", userId, tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("user_functional_areas")
        .select("functional_area_id, functional_areas(id, name)")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as { functional_area_id: string; functional_areas: { id: string; name: string } }[];
    },
  });

  // Fetch KPI definitions for user's areas
  const definitions = useQuery({
    queryKey: ["kpi-defs", userId, tenantId, userAreas.data?.map((a) => a.functional_area_id)],
    enabled: !!userAreas.data,
    queryFn: async () => {
      const areaIds = userAreas.data!.map((a) => a.functional_area_id);
      if (!areaIds.length) return [];
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, unit, direction, target_value, is_required, functional_area_id")
        .in("functional_area_id", areaIds)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing entries for this meeting
  const existingEntries = useQuery({
    queryKey: ["kpi-entries", meetingId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, previous_value, delta, delta_percent, is_improved")
        .eq("meeting_id", meetingId)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data;
    },
  });

  // Fetch previous entries
  const prevEntries = useQuery({
    queryKey: ["kpi-prev-entries", previousMeetingId, userId],
    enabled: !!previousMeetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("kpi_id, current_value")
        .eq("meeting_id", previousMeetingId!)
        .eq("user_id", userId);
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing variances
  const existingVariances = useQuery({
    queryKey: ["kpi-variances", meetingId, userId, tenantId],
    enabled: !!existingEntries.data,
    queryFn: async () => {
      const entryIds = existingEntries.data?.map((e) => e.id) ?? [];
      if (!entryIds.length) return [];
      const { data, error } = await supabase
        .from("kpi_variance_explanations")
        .select("kpi_entry_id, reason, delta_portion, direction")
        .in("kpi_entry_id", entryIds);
      if (error) throw error;
      return data;
    },
  });

  // Build area name map
  const areaNameMap = new Map<string, string>();
  for (const ua of userAreas.data ?? []) {
    areaNameMap.set(ua.functional_area_id, ua.functional_areas?.name ?? "");
  }

  // Initialize state
  useEffect(() => {
    if (!definitions.data || loaded) return;
    const prevMap = new Map(prevEntries.data?.map((e) => [e.kpi_id, e.current_value]) ?? []);
    const entryMap = new Map(existingEntries.data?.map((e) => [e.kpi_id, e]) ?? []);
    const varianceMap = new Map<string, VarianceRow[]>();
    for (const v of existingVariances.data ?? []) {
      if (!varianceMap.has(v.kpi_entry_id)) varianceMap.set(v.kpi_entry_id, []);
      varianceMap.get(v.kpi_entry_id)!.push({
        reason: v.reason,
        delta_portion: v.delta_portion ?? 0,
        direction: v.direction as "positive" | "negative",
      });
    }

    setKpis(
      definitions.data.map((d: any) => {
        const existing = entryMap.get(d.id);
        return {
          kpiId: d.id,
          name: d.name,
          unit: d.unit,
          direction: d.direction,
          targetValue: d.target_value,
          isRequired: d.is_required ?? true,
          currentValue: existing ? String(existing.current_value) : "",
          previousValue: prevMap.get(d.id) ?? null,
          entryId: existing?.id ?? null,
          variances: existing ? (varianceMap.get(existing.id) ?? []) : [],
          areaName: areaNameMap.get(d.functional_area_id) ?? "",
          areaId: d.functional_area_id,
        };
      })
    );
    setLoaded(true);
  }, [definitions.data, existingEntries.data, prevEntries.data, existingVariances.data, loaded]);

  // Auto-save with debounce
  const save = useCallback(
    async (kpiState: KpiState) => {
      const currentVal = parseFloat(kpiState.currentValue);
      if (isNaN(currentVal)) return;

      const prev = kpiState.previousValue;
      const delta = prev !== null ? currentVal - prev : null;
      const deltaPct = prev !== null && prev !== 0 ? (delta! / prev) * 100 : null;
      const isImproved =
        delta !== null
          ? kpiState.direction === "up_is_good"
            ? delta >= 0
            : delta <= 0
          : null;

      // Upsert entry
      let entryId = kpiState.entryId;
      if (entryId) {
        await supabase
          .from("kpi_entries")
          .update({
            current_value: currentVal,
            previous_value: prev,
            delta,
            delta_percent: deltaPct,
            is_improved: isImproved,
          })
          .eq("id", entryId);
      } else {
        const { data } = await supabase
          .from("kpi_entries")
          .insert({
            kpi_id: kpiState.kpiId,
            meeting_id: meetingId,
            user_id: userId,
            tenant_id: tenantId,
            current_value: currentVal,
            previous_value: prev,
            delta,
            delta_percent: deltaPct,
            is_improved: isImproved,
          })
          .select("id")
          .single();
        if (data) {
          entryId = data.id;
          setKpis((prev) =>
            prev.map((k) =>
              k.kpiId === kpiState.kpiId ? { ...k, entryId: data.id } : k
            )
          );
        }
      }

      // Save variances
      if (entryId && kpiState.variances.length > 0) {
        // Delete old
        await supabase
          .from("kpi_variance_explanations")
          .delete()
          .eq("kpi_entry_id", entryId);
        // Insert new
        await supabase.from("kpi_variance_explanations").insert(
          kpiState.variances
            .filter((v) => v.reason.trim())
            .map((v) => ({
              kpi_entry_id: entryId!,
              tenant_id: tenantId,
              reason: v.reason,
              delta_portion: v.delta_portion,
              delta_portion_percent: null,
              direction: v.direction,
            }))
        );
      }

      onSaved();
    },
    [meetingId, userId, tenantId, onSaved]
  );

  const debouncedSave = useCallback(
    (kpiState: KpiState) => {
      if (readOnly) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(kpiState), 2000);
    },
    [save, readOnly]
  );

  const updateKpi = (kpiId: string, updates: Partial<KpiState>) => {
    setKpis((prev) => {
      const next = prev.map((k) => (k.kpiId === kpiId ? { ...k, ...updates } : k));
      const updated = next.find((k) => k.kpiId === kpiId);
      if (updated) debouncedSave(updated);
      return next;
    });
  };

  // Track completion: only required KPIs must be filled for form to be complete
  useEffect(() => {
    if (!kpis.length) return;
    const requiredKpis = kpis.filter((k) => k.isRequired);
    const allRequiredFilled = requiredKpis.every((k) => k.currentValue.trim() !== "");
    onComplete(allRequiredFilled);
  }, [kpis, onComplete]);

  if (definitions.isLoading || userAreas.isLoading) return <Skeleton className="h-40 w-full" />;

  if (!definitions.data?.length) {
    return (
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">1. I tuoi KPI</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nessun KPI definito.</p>
        </CardContent>
      </Card>
    );
  }

  // Group KPIs by area
  const kpisByArea = new Map<string, KpiState[]>();
  for (const kpi of kpis) {
    const list = kpisByArea.get(kpi.areaId) ?? [];
    list.push(kpi);
    kpisByArea.set(kpi.areaId, list);
  }

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-base">1. I tuoi KPI</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from(kpisByArea.entries()).map(([areaId, areaKpis]) => (
          <div key={areaId} className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="inline-flex items-center text-xs font-semibold">
                {areaKpis[0]?.areaName || "Area"}
              </Badge>
            </div>
            {areaKpis.map((kpi) => {
              const currentVal = parseFloat(kpi.currentValue);
              const delta =
                !isNaN(currentVal) && kpi.previousValue !== null
                  ? currentVal - kpi.previousValue
                  : null;
              const isImproved =
                delta !== null
                  ? kpi.direction === "up_is_good"
                    ? delta >= 0
                    : delta <= 0
                  : null;
              const showVariance = delta !== null && delta !== 0;

              return (
                <div key={kpi.kpiId} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">{kpi.name}</Label>
                    <Badge variant="outline" className="inline-flex items-center text-[10px]">{kpi.unit}</Badge>
                    {!kpi.isRequired && (
                      <Badge variant="secondary" className="inline-flex items-center text-[10px]">
                        (opzionale)
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Valore attuale</Label>
                      <Input
                        type="number"
                        step="any"
                        value={kpi.currentValue}
                        onChange={(e) => updateKpi(kpi.kpiId, { currentValue: e.target.value })}
                        disabled={readOnly}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Mese prec.</Label>
                      <p className="mt-1 h-10 flex items-center text-sm font-mono text-muted-foreground">
                        {kpi.previousValue !== null ? kpi.previousValue : "\u2014"}
                      </p>
                    </div>
                    {delta !== null && (
                      <>
                        <div>
                          <Label className="text-xs text-muted-foreground">Delta</Label>
                          <p
                            className="mt-1 h-10 flex items-center text-lg font-semibold font-mono gap-1"
                            style={{
                              color: isImproved
                                ? "hsl(var(--status-done))"
                                : "hsl(var(--status-stuck))",
                            }}
                          >
                            {isImproved ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                            {delta > 0 ? "+" : ""}
                            {delta.toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Delta %</Label>
                          <p
                            className="mt-1 h-10 flex items-center text-sm font-mono"
                            style={{
                              color: isImproved
                                ? "hsl(var(--status-done))"
                                : "hsl(var(--status-stuck))",
                            }}
                          >
                            {kpi.previousValue && kpi.previousValue !== 0
                              ? `${((delta / kpi.previousValue) * 100).toFixed(1)}%`
                              : "\u2014"}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Variance explanations */}
                  {showVariance && (
                    <div className="ml-4 pl-4 border-l-2 border-border space-y-2">
                      <Label className="text-xs text-muted-foreground">Perch&eacute;?</Label>
                      {kpi.variances.map((v, vi) => (
                        <div key={vi} className="flex items-center gap-2">
                          <Input
                            placeholder="Motivo"
                            value={v.reason}
                            onChange={(e) => {
                              const variances = [...kpi.variances];
                              variances[vi] = { ...variances[vi], reason: e.target.value };
                              updateKpi(kpi.kpiId, { variances });
                            }}
                            disabled={readOnly}
                            className="flex-1 text-sm"
                          />
                          <Input
                            type="number"
                            step="any"
                            placeholder="Porzione"
                            value={v.delta_portion || ""}
                            onChange={(e) => {
                              const variances = [...kpi.variances];
                              variances[vi] = {
                                ...variances[vi],
                                delta_portion: parseFloat(e.target.value) || 0,
                              };
                              updateKpi(kpi.kpiId, { variances });
                            }}
                            disabled={readOnly}
                            className="w-24 text-sm"
                          />
                          {!readOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => {
                                const variances = kpi.variances.filter((_, i) => i !== vi);
                                updateKpi(kpi.kpiId, { variances });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {/* Sum warning */}
                      {kpi.variances.length > 0 && delta !== null && (() => {
                        const sum = kpi.variances.reduce((s, v) => s + (v.delta_portion || 0), 0);
                        const diff = Math.abs(sum - Math.abs(delta));
                        return diff > 0.5 ? (
                          <p className="text-xs" style={{ color: "hsl(var(--status-waiting))" }}>
                            La somma delle porzioni ({sum.toFixed(1)}) non corrisponde al delta ({Math.abs(delta).toFixed(1)})
                          </p>
                        ) : null;
                      })()}
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() =>
                            updateKpi(kpi.kpiId, {
                              variances: [
                                ...kpi.variances,
                                { reason: "", delta_portion: 0, direction: delta! > 0 ? "positive" : "negative" },
                              ],
                            })
                          }
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Aggiungi motivo
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
