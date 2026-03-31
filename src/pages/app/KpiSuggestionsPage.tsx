import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Check,
  X,
  Loader2,
  CheckCheck,
  Pencil,
  ArrowUp,
  ArrowDown,
  Info,
} from "lucide-react";
import { toast } from "sonner";

interface SuggestedKpi {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  target_value: number | null;
  ai_rationale: string | null;
  ai_priority: number | null;
  suggestion_source: string | null;
  functional_area_id: string | null;
  functional_areas?: { id: string; name: string } | null;
}

interface EditForm {
  name: string;
  description: string;
  unit: string;
  direction: string;
  target_value: string;
  functional_area_id: string | null;
  user_rationale: string;
}

export default function KpiSuggestionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingKpi, setEditingKpi] = useState<SuggestedKpi | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    description: "",
    unit: "",
    direction: "up_is_good",
    target_value: "",
    functional_area_id: null,
    user_rationale: "",
  });

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["ai-suggested-kpis", user?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("*, functional_areas(id, name)")
        .eq("tenant_id", user!.tenant_id!)
        .eq("ai_suggested", true)
        .eq("is_active", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as SuggestedKpi[];
    },
    enabled: !!user?.tenant_id,
  });

  const { data: areas } = useQuery({
    queryKey: ["functional-areas", user?.tenant_id],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("functional_areas")
        .select("id, name")
        .eq("tenant_id", user!.tenant_id!)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: !!user?.tenant_id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ai-suggested-kpis"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-definitions"] });
    queryClient.invalidateQueries({ queryKey: ["kpi-all-definitions"] });
  };

  const acceptMutation = useMutation({
    mutationFn: async (kpiId: string) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_active: true } as any)
        .eq("id", kpiId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("KPI accettata e attivata");
    },
  });

  const acceptAllMutation = useMutation({
    mutationFn: async (kpiIds: string[]) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_active: true } as any)
        .in("id", kpiIds);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Tutte le KPI accettate e attivate");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (kpiId: string) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .delete()
        .eq("id", kpiId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("KPI scartata");
    },
  });

  const updateAndAcceptMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: EditForm }) => {
      const updateData: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        unit: form.unit.trim(),
        direction: form.direction,
        target_value: form.target_value.trim() ? Number(form.target_value) : null,
        functional_area_id: form.functional_area_id,
        is_active: true,
        is_company_wide: !form.functional_area_id,
      };
      if (form.user_rationale.trim()) {
        updateData.ai_rationale =
          (editingKpi?.ai_rationale || "") +
          "\n\n--- Modificata dall'admin ---\n" +
          form.user_rationale.trim();
      }
      const { error } = await supabase
        .from("kpi_definitions")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditingKpi(null);
      toast.success("KPI modificata e attivata");
    },
  });

  const openEdit = (kpi: SuggestedKpi) => {
    setEditingKpi(kpi);
    setEditForm({
      name: kpi.name,
      description: kpi.description || "",
      unit: kpi.unit,
      direction: kpi.direction,
      target_value: kpi.target_value != null ? String(kpi.target_value) : "",
      functional_area_id: kpi.functional_area_id,
      user_rationale: "",
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!suggestions?.length) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">KPI suggerite dall'AI</h1>
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nessuna KPI suggerita in attesa di revisione.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Le KPI vengono suggerite dopo l'onboarding o il caricamento del bilancio.
          </p>
        </div>
      </div>
    );
  }

  // Group by functional area, sorted by priority within each group
  const grouped = suggestions.reduce<Record<string, SuggestedKpi[]>>((acc, kpi) => {
    const areaName = kpi.functional_areas?.name || "Azienda";
    if (!acc[areaName]) acc[areaName] = [];
    acc[areaName].push(kpi);
    return acc;
  }, {});
  for (const kpis of Object.values(grouped)) {
    kpis.sort((a, b) => (a.ai_priority ?? 99) - (b.ai_priority ?? 99));
  }

  const allIds = suggestions.map((k) => k.id);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            KPI suggerite dall'AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rivedi le KPI suggerite per ogni area funzionale. Puoi accettarle, modificarle o scartarle.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{suggestions.length} in attesa</Badge>
          <Button
            variant="default"
            size="sm"
            onClick={() => acceptAllMutation.mutate(allIds)}
            disabled={acceptAllMutation.isPending}
          >
            {acceptAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <CheckCheck className="h-4 w-4 mr-1" />
            )}
            Accetta tutte
          </Button>
        </div>
      </div>

      {/* Grouped by area */}
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([areaName, kpis]) => (
          <div key={areaName}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              {areaName}
              <Badge variant="outline" className="ml-2 text-xs">
                {kpis.length}
              </Badge>
            </h2>
            <div className="grid gap-3">
              {kpis.map((kpi) => (
                <Card key={kpi.id} className="border border-border">
                  <CardContent className="p-4 space-y-3">
                    {/* Top row: name + actions */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {kpi.ai_priority && (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-foreground text-background text-xs font-bold shrink-0">
                              {kpi.ai_priority}
                            </span>
                          )}
                          <p className="text-sm font-medium">{kpi.name}</p>
                          <Badge variant="outline" className="text-xs">{kpi.unit}</Badge>
                          {kpi.direction === "up_is_good" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-green-600" />
                          )}
                          {kpi.target_value != null && (
                            <Badge variant="outline" className="text-xs">
                              Target: {new Intl.NumberFormat("it-IT").format(kpi.target_value)} {kpi.unit}
                            </Badge>
                          )}
                        </div>
                        {kpi.description && (
                          <p className="text-xs text-muted-foreground mt-1">{kpi.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Modifica e accetta"
                          onClick={() => openEdit(kpi)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          title="Accetta"
                          onClick={() => acceptMutation.mutate(kpi.id)}
                          disabled={acceptMutation.isPending}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          title="Scarta"
                          onClick={() => rejectMutation.mutate(kpi.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* AI rationale */}
                    {kpi.ai_rationale && (
                      <div className="flex items-start gap-2 bg-muted/40 rounded-md p-3">
                        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-0.5">Perche questa KPI</p>
                          <p className="text-xs text-foreground">{kpi.ai_rationale}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

      {/* Edit Sheet */}
      <Sheet open={!!editingKpi} onOpenChange={(open) => !open && setEditingKpi(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Modifica KPI</SheetTitle>
            <SheetDescription>
              Modifica i valori suggeriti dall'AI prima di attivarla. Spiega il perche delle modifiche.
            </SheetDescription>
          </SheetHeader>

          {editingKpi && (
            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                updateAndAcceptMutation.mutate({ id: editingKpi.id, form: editForm });
              }}
            >
              {/* Original AI rationale */}
              {editingKpi.ai_rationale && (
                <div className="bg-muted/40 rounded-md p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Suggerimento AI</p>
                  <p className="text-xs">{editingKpi.ai_rationale}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Nome KPI</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Descrizione</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Unita di misura</Label>
                  <Input
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Target</Label>
                  <Input
                    type="number"
                    value={editForm.target_value}
                    onChange={(e) => setEditForm({ ...editForm, target_value: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Direzione positiva</Label>
                <Select
                  value={editForm.direction}
                  onValueChange={(v) => setEditForm({ ...editForm, direction: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="up_is_good">Crescita positiva</SelectItem>
                    <SelectItem value="down_is_good">Calo positivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Area funzionale</Label>
                <Select
                  value={editForm.functional_area_id ?? "__none__"}
                  onValueChange={(v) =>
                    setEditForm({ ...editForm, functional_area_id: v === "__none__" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Aziendale</SelectItem>
                    {(areas || []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* User rationale for changes */}
              <div className="space-y-2 border-t pt-4">
                <Label>Perche hai modificato questa KPI?</Label>
                <Textarea
                  placeholder="es. Il target suggerito era troppo alto per il nostro mercato attuale, ho ridotto a un valore piu realistico..."
                  value={editForm.user_rationale}
                  onChange={(e) => setEditForm({ ...editForm, user_rationale: e.target.value })}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Opzionale, ma utile per tenere traccia delle decisioni.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={updateAndAcceptMutation.isPending || !editForm.name.trim() || !editForm.unit.trim()}
                >
                  {updateAndAcceptMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Salva e attiva
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingKpi(null)}>
                  Annulla
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
