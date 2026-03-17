import { useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, BarChart3, Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  meetingId: string;
  tenantId: string;
  isAdmin?: boolean;
  scheduledDate?: string;
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
  kpi_direction: string;
  user_name: string;
  functional_area_id: string | null;
  functional_area_name: string | null;
  variances: { reason: string; delta_portion: number | null; direction: string }[];
}

// ── Admin KPI Fill Dialog ───────────────────────────────────────────────────

interface AdminKpiFillProps {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  tenantId: string;
  targetUserId: string;
  targetUserName: string;
  scheduledDate?: string;
}

interface AdminKpiState {
  kpiId: string;
  name: string;
  unit: string;
  direction: string;
  isRequired: boolean;
  currentValue: string;
  previousValue: number | null;
  areaName: string;
}

function AdminKpiFillDialog({ open, onClose, meetingId, tenantId, targetUserId, targetUserName, scheduledDate }: AdminKpiFillProps) {
  const [kpis, setKpis] = useState<AdminKpiState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  // Find previous meeting
  const prevMeeting = useQuery({
    queryKey: ["admin-kpi-prev-meeting", tenantId, scheduledDate],
    enabled: open && !!scheduledDate,
    queryFn: async () => {
      const { data } = await supabase
        .from("meetings")
        .select("id")
        .eq("tenant_id", tenantId)
        .lt("scheduled_date", scheduledDate!)
        .order("scheduled_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch user's areas
  const userAreas = useQuery({
    queryKey: ["admin-kpi-user-areas", targetUserId, tenantId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("user_functional_areas")
        .select("functional_area_id, functional_areas(id, name)")
        .eq("user_id", targetUserId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return (data ?? []) as { functional_area_id: string; functional_areas: { id: string; name: string } }[];
    },
  });

  // Fetch KPI definitions for user's areas
  const definitions = useQuery({
    queryKey: ["admin-kpi-defs", targetUserId, tenantId, userAreas.data?.map((a: any) => a.functional_area_id)],
    enabled: open && !!userAreas.data,
    queryFn: async () => {
      const areaIds = userAreas.data!.map((a: any) => a.functional_area_id);
      if (!areaIds.length) return [];
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, unit, direction, is_required, functional_area_id")
        .in("functional_area_id", areaIds)
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing entries for this user in this meeting
  const existingEntries = useQuery({
    queryKey: ["admin-kpi-existing", meetingId, targetUserId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value")
        .eq("meeting_id", meetingId)
        .eq("user_id", targetUserId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch previous entries
  const prevEntries = useQuery({
    queryKey: ["admin-kpi-prev-entries", prevMeeting.data?.id, targetUserId],
    enabled: open && !!prevMeeting.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("kpi_id, current_value")
        .eq("meeting_id", prevMeeting.data!.id)
        .eq("user_id", targetUserId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const areaNameMap = new Map<string, string>();
  for (const ua of userAreas.data ?? []) {
    areaNameMap.set(ua.functional_area_id, ua.functional_areas?.name ?? "");
  }

  // Initialize when data loads
  if (open && definitions.data && !loaded && existingEntries.data !== undefined) {
    const prevMap = new Map(prevEntries.data?.map((e) => [e.kpi_id, e.current_value]) ?? []);
    const entryMap = new Map(existingEntries.data.map((e) => [e.kpi_id, e]));

    setKpis(
      definitions.data.map((d: any) => {
        const existing = entryMap.get(d.id);
        return {
          kpiId: d.id,
          name: d.name,
          unit: d.unit,
          direction: d.direction,
          isRequired: d.is_required ?? true,
          currentValue: existing ? String(existing.current_value) : "",
          previousValue: prevMap.get(d.id) ?? null,
          areaName: areaNameMap.get(d.functional_area_id) ?? "",
        };
      })
    );
    setLoaded(true);
  }

  // Reset on close
  const handleClose = () => {
    setLoaded(false);
    setKpis([]);
    onClose();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const kpi of kpis) {
        const currentVal = parseFloat(kpi.currentValue);
        if (isNaN(currentVal)) continue;

        const prev = kpi.previousValue;
        const delta = prev !== null ? currentVal - prev : null;
        const deltaPct = prev !== null && prev !== 0 ? (delta! / prev) * 100 : null;
        const isImproved =
          delta !== null
            ? kpi.direction === "up_is_good"
              ? delta >= 0
              : delta <= 0
            : null;

        // Check if entry exists
        const { data: existing } = await supabase
          .from("kpi_entries")
          .select("id")
          .eq("meeting_id", meetingId)
          .eq("user_id", targetUserId)
          .eq("kpi_id", kpi.kpiId)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from("kpi_entries")
            .update({
              current_value: currentVal,
              previous_value: prev,
              delta,
              delta_percent: deltaPct,
              is_improved: isImproved,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("kpi_entries").insert({
            kpi_id: kpi.kpiId,
            meeting_id: meetingId,
            user_id: targetUserId,
            tenant_id: tenantId,
            current_value: currentVal,
            previous_value: prev,
            delta,
            delta_percent: deltaPct,
            is_improved: isImproved,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["detail-kpi-grouped"] });
      queryClient.invalidateQueries({ queryKey: ["admin-kpi-missing"] });
      toast({ title: `KPI salvati per ${targetUserName}` });
      handleClose();
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isLoading = definitions.isLoading || userAreas.isLoading || existingEntries.isLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compila KPI per {targetUserName}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : kpis.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nessun KPI definito per questo utente.</p>
        ) : (
          <div className="space-y-4">
            {kpis.map((kpi) => {
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

              return (
                <div key={kpi.kpiId} className="space-y-2 p-3 rounded-lg bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium text-sm">{kpi.name}</Label>
                    <Badge variant="outline" className="text-[10px]">{kpi.unit}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{kpi.areaName}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Valore attuale</Label>
                      <Input
                        type="number"
                        step="any"
                        value={kpi.currentValue}
                        onChange={(e) => {
                          setKpis((prev) =>
                            prev.map((k) =>
                              k.kpiId === kpi.kpiId ? { ...k, currentValue: e.target.value } : k
                            )
                          );
                        }}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Precedente</Label>
                      <p className="mt-1 h-8 flex items-center text-sm font-mono text-muted-foreground">
                        {kpi.previousValue !== null ? kpi.previousValue : "—"}
                      </p>
                    </div>
                    {delta !== null && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Delta</Label>
                        <p
                          className="mt-1 h-8 flex items-center text-sm font-semibold font-mono gap-1"
                          style={{
                            color: isImproved
                              ? "hsl(var(--status-done))"
                              : "hsl(var(--status-stuck))",
                          }}
                        >
                          {isImproved ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(1)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Annulla
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Salvataggio..." : "Salva KPI"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main KpiTab ─────────────────────────────────────────────────────────────

export function KpiTab({ meetingId, tenantId, isAdmin, scheduledDate }: Props) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [collapsedAreas, setCollapsedAreas] = useState<Set<string>>(new Set());
  const [fillDialogUser, setFillDialogUser] = useState<{ id: string; name: string } | null>(null);

  // Fetch existing KPI data (same as before)
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
          ? supabase.from("kpi_definitions").select("id, name, unit, direction, functional_area_id").in("id", kpiIds)
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

      const kpiMap = new Map<string, { name: string; unit: string; direction: string; functional_area_id: string | null }>();
      for (const k of kpis.data ?? []) kpiMap.set(k.id, { name: k.name, unit: k.unit, direction: k.direction, functional_area_id: k.functional_area_id });

      const userMap = new Map<string, string>();
      for (const u of users.data ?? []) userMap.set(u.id, u.full_name);

      const varianceMap = new Map<string, Array<{ reason: string; delta_portion: number | null; direction: string }>>();
      for (const v of variances.data ?? []) {
        if (!varianceMap.has(v.kpi_entry_id)) varianceMap.set(v.kpi_entry_id, []);
        varianceMap.get(v.kpi_entry_id)!.push(v);
      }

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
          kpi_direction: kpi?.direction ?? "up_is_good",
          user_name: userMap.get(e.user_id) ?? "—",
          functional_area_id: userAreaId,
          functional_area_name: userAreaId ? (areaNameMap.get(userAreaId) ?? "Altro") : null,
          variances: varianceMap.get(e.id) ?? [],
        };
      });

      const grouped = new Map<string, KpiEntry[]>();
      for (const e of enriched) {
        const areaKey = e.functional_area_name ?? "Senza Area";
        if (!grouped.has(areaKey)) grouped.set(areaKey, []);
        grouped.get(areaKey)!.push(e);
      }

      const sortedAreas = [...grouped.entries()].sort((a, b) => {
        if (a[0] === "Senza Area") return 1;
        if (b[0] === "Senza Area") return -1;
        return a[0].localeCompare(b[0]);
      });

      return { areas: sortedAreas, areaNames: areas.data ?? [] };
    },
  });

  // Admin: find users who are missing KPI entries
  const missingUsers = useQuery({
    queryKey: ["admin-kpi-missing", meetingId, tenantId],
    enabled: !!isAdmin,
    queryFn: async () => {
      // Get all users with functional areas (who should have KPIs)
      const { data: allUfa, error: ufaErr } = await supabase
        .from("user_functional_areas")
        .select("user_id, functional_area_id")
        .eq("tenant_id", tenantId);
      if (ufaErr) throw ufaErr;

      const userIds = [...new Set((allUfa ?? []).map((u) => u.user_id))];
      if (!userIds.length) return [];

      // Get users info
      const { data: usersData } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", userIds)
        .eq("is_active", true)
        .order("full_name");

      // Get existing entries for this meeting
      const { data: existingEntries } = await supabase
        .from("kpi_entries")
        .select("user_id")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId);

      const usersWithEntries = new Set((existingEntries ?? []).map((e) => e.user_id));

      // Get area names
      const areaIds = [...new Set((allUfa ?? []).map((u) => u.functional_area_id))];
      const { data: areasData } = await supabase
        .from("functional_areas")
        .select("id, name")
        .in("id", areaIds);
      const areaNameMap = new Map((areasData ?? []).map((a) => [a.id, a.name]));

      // Build user → areas map
      const userAreaNames = new Map<string, string[]>();
      for (const ufa of allUfa ?? []) {
        if (!userAreaNames.has(ufa.user_id)) userAreaNames.set(ufa.user_id, []);
        const name = areaNameMap.get(ufa.functional_area_id);
        if (name) userAreaNames.get(ufa.user_id)!.push(name);
      }

      return (usersData ?? [])
        .filter((u) => !usersWithEntries.has(u.id))
        .map((u) => ({
          id: u.id,
          full_name: u.full_name,
          areas: userAreaNames.get(u.id) ?? [],
        }));
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

  const hasMissing = (missingUsers.data ?? []).length > 0;

  return (
    <div className="space-y-6">
      {/* Admin section: users missing KPIs */}
      {isAdmin && hasMissing && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                Utenti senza KPI compilati ({missingUsers.data!.length})
              </span>
            </div>
            <div className="space-y-2">
              {missingUsers.data!.map((u) => (
                <div key={u.id} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-background/60">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{u.full_name}</span>
                    {u.areas.map((a) => (
                      <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setFillDialogUser({ id: u.id, name: u.full_name })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Compila KPI
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing KPI data */}
      {!kpiData.data?.areas.length && !hasMissing ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nessun dato KPI per questa riunione.</p>
        </div>
      ) : (
        kpiData.data?.areas.map(([areaName, entries]) => {
          const isCollapsed = collapsedAreas.has(areaName);
          const improved = entries.filter((e) => e.is_improved === true).length;
          const declined = entries.filter((e) => e.is_improved === false).length;

          return (
            <div key={areaName}>
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
        })
      )}

      {/* Admin fill dialog */}
      {fillDialogUser && (
        <AdminKpiFillDialog
          open={!!fillDialogUser}
          onClose={() => setFillDialogUser(null)}
          meetingId={meetingId}
          tenantId={tenantId}
          targetUserId={fillDialogUser.id}
          targetUserName={fillDialogUser.name}
          scheduledDate={scheduledDate}
        />
      )}
    </div>
  );
}
