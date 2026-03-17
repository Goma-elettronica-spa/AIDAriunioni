import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Lightbulb,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";

interface Props {
  meetingId: string;
  tenantId: string;
  isAdmin: boolean;
  summaryText?: string | null;
  transcriptUrl?: string | null;
}

interface TenantUser {
  id: string;
  full_name: string;
  job_title: string | null;
}

interface SuggestedUpgrade {
  id: string;
  title: string;
  description: string | null;
  owner_user_id: string;
  reason_why: string;
  value_unit: string;
  value_amount: number;
  linked_kpi_id: string | null;
  status: string;
  meeting_id: string | null;
  tenant_id: string;
  created_at: string;
}

interface UpgradeEditState {
  title: string;
  description: string;
  owner_user_id: string;
  reason_why: string;
  value_unit: string;
  value_amount: string;
  linked_kpi_id: string;
  deadline_date: string;
}

interface KpiDefWithArea {
  id: string;
  name: string;
  unit: string;
  area_name: string;
  functional_area_id: string | null;
}

export function UpgradeTab({ meetingId, tenantId, isAdmin, summaryText, transcriptUrl }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [generatingUpgrades, setGeneratingUpgrades] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [upgradeEdits, setUpgradeEdits] = useState<Record<string, UpgradeEditState>>({});

  // Fetch next meeting date for default deadline
  const nextMeeting = useQuery({
    queryKey: ["next-meeting", tenantId],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("meetings")
        .select("id, scheduled_date")
        .eq("tenant_id", tenantId)
        .gt("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.scheduled_date ?? "";
    },
  });

  const defaultDeadline = nextMeeting.data || new Date().toISOString().slice(0, 10);

  // Fetch tenant users for assignment dropdown
  const tenantUsers = useQuery({
    queryKey: ["tenant-users", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, job_title")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as TenantUser[];
    },
  });

  // Fetch KPI definitions with area names
  const kpiDefs = useQuery({
    queryKey: ["kpi-defs-with-areas", tenantId],
    queryFn: async () => {
      const { data: kpis, error: kpiError } = await supabase
        .from("kpi_definitions")
        .select("id, name, unit, functional_area_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      if (kpiError) throw kpiError;

      const { data: areasData, error: areasError } = await (supabase.from as any)("functional_areas")
        .select("id, name")
        .eq("tenant_id", tenantId);
      if (areasError) throw areasError;

      const areaMap = new Map<string, string>();
      for (const a of areasData ?? []) {
        areaMap.set(a.id, a.name);
      }

      return (kpis ?? []).map((k: any) => ({
        id: k.id,
        name: k.name,
        unit: k.unit,
        area_name: areaMap.get(k.functional_area_id) ?? "",
        functional_area_id: k.functional_area_id,
      })) as KpiDefWithArea[];
    },
  });

  // Fetch all upgrade_requests for this meeting
  const allUpgrades = useQuery({
    queryKey: ["upgrade-requests-all", meetingId],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("upgrade_requests")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as SuggestedUpgrade[];
    },
  });

  // Initialize upgrade edit state
  useEffect(() => {
    if (allUpgrades.data) {
      const newEdits: Record<string, UpgradeEditState> = {};
      for (const su of allUpgrades.data) {
        if (su.status === "proposed" && !upgradeEdits[su.id]) {
          newEdits[su.id] = {
            title: su.title,
            description: su.description ?? "",
            owner_user_id: su.owner_user_id ?? "",
            reason_why: su.reason_why ?? "revenue_generation",
            value_unit: su.value_unit ?? "money",
            value_amount: String(su.value_amount ?? 0),
            linked_kpi_id: su.linked_kpi_id ?? "",
            deadline_date: defaultDeadline,
          };
        }
      }
      if (Object.keys(newEdits).length > 0) {
        setUpgradeEdits((prev) => ({ ...prev, ...newEdits }));
      }
    }
  }, [allUpgrades.data, defaultDeadline]);

  const getTranscriptText = async (): Promise<string> => {
    // 1. Try fetching transcript from URL (any text-based file)
    if (transcriptUrl) {
      try {
        const r = await fetch(transcriptUrl);
        if (r.ok) {
          const contentType = r.headers.get("content-type") ?? "";
          // Only read as text if it's not a binary format
          if (!contentType.includes("application/pdf") && !contentType.includes("application/zip")) {
            const text = await r.text();
            if (text && text.trim().length > 10) {
              return text;
            }
          }
        }
      } catch {
        // fall through to summary_text
      }
    }

    // 2. Fallback to summary_text
    if (summaryText && summaryText.trim().length > 10) {
      return summaryText;
    }

    return "";
  };

  const generateSuggestedUpgrades = async () => {
    if (!transcriptUrl && !summaryText) {
      toast({
        title: "Trascrizione mancante",
        description: "Carica prima una trascrizione nella tab Materiale per permettere a Claudietto di analizzarla.",
        variant: "destructive",
      });
      return;
    }

    const transcriptText = await getTranscriptText();

    if (!transcriptText) {
      toast({
        title: "Impossibile leggere la trascrizione",
        description: "Il file di trascrizione non è leggibile. Carica un file .txt o .md nella tab Materiale.",
        variant: "destructive",
      });
      return;
    }

    const users = tenantUsers.data ?? [];
    const kpis = kpiDefs.data ?? [];

    setGeneratingUpgrades(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("suggest-upgrades", {
        body: {
          transcriptText: transcriptText.slice(0, 30000),
          users: users.map((u) => ({ full_name: u.full_name, job_title: u.job_title })),
          kpis: kpis.map((k) => ({ name: k.name, unit: k.unit, area_name: k.area_name })),
        },
      });

      if (fnError) throw new Error(fnError.message || "Errore chiamata AI");
      if (fnData?.error) throw new Error(fnData.error);

      const rawUpgrades = (fnData.upgrades ?? []) as Array<{
        title: string;
        description: string;
        suggested_role: string;
        reason_why: string;
        value_unit: string;
        value_amount: number;
        linked_kpi_name?: string;
      }>;

      if (!rawUpgrades?.length) {
        toast({ title: "Nessun upgrade suggerito dall'AI", variant: "destructive" });
        setGeneratingUpgrades(false);
        return;
      }

      const inserts = rawUpgrades.map((u) => {
        let ownerId = user!.id;
        if (u.suggested_role) {
          const match = users.find(
            (tu) =>
              tu.job_title &&
              tu.job_title.toLowerCase().includes(u.suggested_role.toLowerCase()),
          );
          if (match) ownerId = match.id;
        }

        let linkedKpiId: string | null = null;
        if (u.linked_kpi_name) {
          const kpiMatch = kpis.find(
            (k) => k.name.toLowerCase() === u.linked_kpi_name!.toLowerCase(),
          );
          if (kpiMatch) linkedKpiId = kpiMatch.id;
        }

        return {
          meeting_id: meetingId,
          tenant_id: tenantId,
          title: u.title,
          description: u.description || null,
          owner_user_id: ownerId,
          created_by_user_id: user!.id,
          reason_why: u.reason_why || "revenue_generation",
          value_unit: u.value_unit || "money",
          value_amount: u.value_amount || 0,
          linked_kpi_id: linkedKpiId,
          status: "proposed",
          position: 0,
        };
      });

      const { error } = await (supabase.from as any)("upgrade_requests").insert(inserts);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["upgrade-requests-all", meetingId] });
      for (const u of rawUpgrades) {
        writeAuditLog({
          tenantId,
          userId: user!.id,
          action: "create",
          entityType: "upgrade_request",
          entityId: meetingId,
          newValues: { title: u.title, reason_why: u.reason_why },
        });
      }
      toast({ title: "Upgrade suggeriti generati con successo!" });
    } catch (err: any) {
      toast({ title: "Errore generazione upgrade", description: err.message, variant: "destructive" });
    }
    setGeneratingUpgrades(false);
  };

  const confirmUpgrade = async (su: SuggestedUpgrade) => {
    const edit = upgradeEdits[su.id];
    if (!edit) return;
    try {
      const { error } = await (supabase.from as any)("upgrade_requests")
        .update({
          title: edit.title,
          description: edit.description || null,
          owner_user_id: edit.owner_user_id || su.owner_user_id,
          reason_why: edit.reason_why,
          value_unit: edit.value_unit,
          value_amount: parseFloat(edit.value_amount) || 0,
          linked_kpi_id: edit.linked_kpi_id && edit.linked_kpi_id !== "none" ? edit.linked_kpi_id : null,
          status: "todo",
        })
        .eq("id", su.id);
      if (error) throw error;

      // Send notification to the owner
      const ownerId = edit.owner_user_id || su.owner_user_id;
      if (ownerId && ownerId !== user!.id) {
        await (supabase.from as any)("notifications").insert({
          tenant_id: tenantId,
          user_id: ownerId,
          type: "upgrade_assigned",
          title: "Nuovo upgrade assegnato",
          body: `Ti e' stato assegnato: "${edit.title}"`,
          link: "/upgrade",
          created_by: user!.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["upgrade-requests-all", meetingId] });
      writeAuditLog({
        tenantId,
        userId: user!.id,
        action: "update",
        entityType: "upgrade_request",
        entityId: su.id,
        newValues: { title: edit.title, status: "todo" },
      });
      toast({ title: "Upgrade confermato" });
    } catch (err: any) {
      toast({ title: "Errore conferma upgrade", description: err.message, variant: "destructive" });
    }
  };

  const deleteUpgrade = async (upgradeId: string) => {
    try {
      const { error } = await (supabase.from as any)("upgrade_requests")
        .delete()
        .eq("id", upgradeId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["upgrade-requests-all", meetingId] });
      writeAuditLog({
        tenantId,
        userId: user!.id,
        action: "delete",
        entityType: "upgrade_request",
        entityId: upgradeId,
      });
      toast({ title: "Upgrade eliminato" });
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    }
  };

  const updateUpgradeEdit = (upgradeId: string, field: keyof UpgradeEditState, value: string) => {
    setUpgradeEdits((prev) => ({
      ...prev,
      [upgradeId]: { ...prev[upgradeId], [field]: value },
    }));
  };

  const upgradesList = allUpgrades.data ?? [];
  const proposedUpgrades = upgradesList.filter((u) => u.status === "proposed");
  const confirmedUpgrades = upgradesList.filter((u) => u.status === "todo" || u.status === "wip" || u.status === "done");
  const rejectedUpgrades = upgradesList.filter((u) => u.status === "rejected");

  const isLoading = allUpgrades.isLoading;

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-8">
      {/* AI Generation Section */}
      {isAdmin && (transcriptUrl || summaryText) && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Genera con AI</h3>
          <div className="flex items-center gap-3">
            <Button
              className="bg-foreground text-background hover:bg-foreground/90"
              onClick={generateSuggestedUpgrades}
              disabled={generatingUpgrades}
            >
              {generatingUpgrades ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analisi in corso...
                </>
              ) : (
                <>
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Claudietto suggeriscimi Upgrade
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Proposed upgrades — editable */}
      {proposedUpgrades.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Upgrade Suggeriti dall'AI</h3>
          <div className="space-y-3">
            {proposedUpgrades.map((su) => {
              const edit = upgradeEdits[su.id] ?? {
                title: su.title,
                description: su.description ?? "",
                owner_user_id: su.owner_user_id ?? "",
                reason_why: su.reason_why ?? "revenue_generation",
                value_unit: su.value_unit ?? "money",
                value_amount: String(su.value_amount ?? 0),
                linked_kpi_id: su.linked_kpi_id ?? "",
                deadline_date: defaultDeadline,
              };
              return (
                <Card key={su.id} className="border border-border">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="inline-flex items-center text-[10px]">
                        <Lightbulb className="h-2.5 w-2.5 mr-1" />
                        AI Upgrade
                      </Badge>
                      <Badge variant="secondary" className="inline-flex items-center text-[10px]">
                        {edit.reason_why === "revenue_generation" ? "Revenue Generation" : "Cost Cutting"}
                      </Badge>
                    </div>

                    <Input
                      value={edit.title}
                      onChange={(e) => updateUpgradeEdit(su.id, "title", e.target.value)}
                      placeholder="Titolo upgrade"
                      className="text-sm font-medium"
                    />

                    <Textarea
                      value={edit.description}
                      onChange={(e) => updateUpgradeEdit(su.id, "description", e.target.value)}
                      placeholder="Descrizione"
                      rows={3}
                      className="text-sm"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Owner
                        </label>
                        <Select
                          value={edit.owner_user_id}
                          onValueChange={(val) => updateUpgradeEdit(su.id, "owner_user_id", val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Seleziona utente" />
                          </SelectTrigger>
                          <SelectContent>
                            {(tenantUsers.data ?? []).map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.full_name}
                                {u.job_title ? ` \u2014 ${u.job_title}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Ruolo suggerito
                        </label>
                        <Badge variant="secondary" className="inline-flex items-center text-xs mt-1">
                          {(tenantUsers.data ?? []).find((u) => u.id === su.owner_user_id)?.job_title ?? "N/A"}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Reason Why
                        </label>
                        <Select
                          value={edit.reason_why}
                          onValueChange={(val) => updateUpgradeEdit(su.id, "reason_why", val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="revenue_generation">Revenue Generation</SelectItem>
                            <SelectItem value="cost_cutting">Cost Cutting</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Unita' valore
                        </label>
                        <Select
                          value={edit.value_unit}
                          onValueChange={(val) => updateUpgradeEdit(su.id, "value_unit", val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="money">Soldi</SelectItem>
                            <SelectItem value="license_cost">Costi Licenza</SelectItem>
                            <SelectItem value="man_hours">Ore Uomo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          Valore stimato
                        </label>
                        <Input
                          type="number"
                          step="any"
                          value={edit.value_amount}
                          onChange={(e) => updateUpgradeEdit(su.id, "value_amount", e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        KPI collegata
                      </label>
                      <Select
                        value={edit.linked_kpi_id}
                        onValueChange={(val) => updateUpgradeEdit(su.id, "linked_kpi_id", val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleziona KPI (opzionale)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessuna</SelectItem>
                          {(kpiDefs.data ?? []).map((k) => (
                            <SelectItem key={k.id} value={k.id}>
                              {k.area_name ? `${k.area_name}: ` : ""}{k.name} ({k.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => confirmUpgrade(su)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Conferma
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deleteUpgrade(su.id)}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Elimina
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmed upgrades */}
      {confirmedUpgrades.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Upgrade Confermati</h3>
          <div className="space-y-2">
            {confirmedUpgrades.map((su) => (
              <Card key={su.id} className="border border-border bg-muted/10">
                <CardContent className="flex items-center justify-between p-6">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{su.title}</p>
                    {su.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{su.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="inline-flex items-center text-[10px]">
                        {su.reason_why === "revenue_generation" ? "Revenue" : "Cost Cutting"}
                      </Badge>
                      <Badge variant="outline" className="inline-flex items-center text-[10px]">
                        {su.value_unit === "money" ? "Soldi" : su.value_unit === "license_cost" ? "Licenza" : "Ore"}: {su.value_amount}
                      </Badge>
                    </div>
                  </div>
                  <Badge className="inline-flex items-center bg-green-100 text-green-800 text-[10px] ml-3 shrink-0">
                    <Check className="h-2.5 w-2.5 mr-1" />
                    Confermato
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Toggle rejected */}
      {rejectedUpgrades.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={() => setShowRejected(!showRejected)}
          >
            {showRejected ? (
              <EyeOff className="h-3 w-3 mr-1" />
            ) : (
              <Eye className="h-3 w-3 mr-1" />
            )}
            {showRejected ? "Nascondi rifiutati" : `Mostra rifiutati (${rejectedUpgrades.length})`}
          </Button>

          {showRejected && (
            <div className="space-y-2 mt-2">
              {rejectedUpgrades.map((su) => (
                <Card key={su.id} className="border border-border opacity-50">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground line-through">{su.title}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="inline-flex items-center text-[10px] ml-3 shrink-0"
                    >
                      Rifiutato
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {upgradesList.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nessun upgrade per questa riunione.
        </p>
      )}
    </div>
  );
}
