import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowUp,
  ArrowDown,
  Pencil,
  EyeOff,
  Plus,
  X,
} from "lucide-react";

interface KpiManagementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaId: string | null;
  areaName: string;
  tenantId: string;
}

type KpiRow = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  target_value: number | null;
  is_active: boolean;
  is_required: boolean;
  functional_area_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
};

type KpiFormData = {
  name: string;
  description: string;
  unit: string;
  direction: string;
  target_value: string;
  is_required: boolean;
};

const emptyForm: KpiFormData = {
  name: "",
  description: "",
  unit: "",
  direction: "up_is_good",
  target_value: "",
  is_required: true,
};

function formatTarget(value: number | null, unit: string): string {
  if (value == null) return "";
  const formatted = new Intl.NumberFormat("it-IT").format(value);
  return `Target: ${formatted} ${unit}`;
}

export default function KpiManagementSheet({
  open,
  onOpenChange,
  areaId,
  areaName,
  tenantId,
}: KpiManagementSheetProps) {
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<KpiFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<KpiFormData>(emptyForm);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  const kpis = useQuery({
    queryKey: ["kpi-definitions", areaId ?? "__company__", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      let q = supabase
        .from("kpi_definitions")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (areaId) {
        q = q.eq("functional_area_id", areaId);
      } else {
        q = q.is("functional_area_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as KpiRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (form: KpiFormData) => {
      const { error } = await supabase.from("kpi_definitions").insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        unit: form.unit.trim(),
        direction: form.direction,
        target_value: form.target_value.trim() ? Number(form.target_value) : null,
        is_required: form.is_required,
        functional_area_id: areaId ?? undefined,
        tenant_id: tenantId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, form) => {
      queryClient.invalidateQueries({ queryKey: ["kpi-definitions", areaId ?? "__company__", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["kpi-all-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-counts", tenantId] });
      writeAuditLog({
        tenantId,
        userId: authUser!.id,
        action: "create",
        entityType: "kpi_definition",
        entityId: crypto.randomUUID(),
        newValues: { name: form.name, unit: form.unit, direction: form.direction, target_value: form.target_value || null, functional_area_id: areaId },
      });
      setShowCreateForm(false);
      setCreateForm(emptyForm);
      toast({ title: "KPI creato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: KpiFormData }) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({
          name: form.name.trim(),
          description: form.description.trim() || null,
          unit: form.unit.trim(),
          direction: form.direction,
          target_value: form.target_value.trim() ? Number(form.target_value) : null,
          is_required: form.is_required,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["kpi-definitions", areaId, tenantId] });
      queryClient.invalidateQueries({ queryKey: ["kpi-all-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-counts", tenantId] });
      const oldKpi = activeKpis.find((k) => k.id === variables.id);
      writeAuditLog({
        tenantId,
        userId: authUser!.id,
        action: "update",
        entityType: "kpi_definition",
        entityId: variables.id,
        oldValues: oldKpi ? { name: oldKpi.name, unit: oldKpi.unit, direction: oldKpi.direction, target_value: oldKpi.target_value } : null,
        newValues: { name: variables.form.name, unit: variables.form.unit, direction: variables.form.direction, target_value: variables.form.target_value || null },
      });
      setEditingId(null);
      toast({ title: "KPI aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      // NEVER delete - only set is_active=false to preserve historical data
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["kpi-definitions", areaId, tenantId] });
      queryClient.invalidateQueries({ queryKey: ["kpi-all-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-counts", tenantId] });
      writeAuditLog({
        tenantId,
        userId: authUser!.id,
        action: "update",
        entityType: "kpi_definition",
        entityId: id,
        oldValues: { is_active: true },
        newValues: { is_active: false },
      });
      setConfirmDeactivateId(null);
      toast({
        title: "KPI disattivato",
        description: "I dati storici saranno preservati",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const toggleRequiredMutation = useMutation({
    mutationFn: async ({ id, is_required }: { id: string; is_required: boolean }) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_required: !is_required })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["kpi-definitions", areaId, tenantId] });
      queryClient.invalidateQueries({ queryKey: ["kpi-all-definitions"] });
      const kpi = activeKpis.find((k) => k.id === variables.id);
      writeAuditLog({
        tenantId,
        userId: authUser!.id,
        action: "update",
        entityType: "kpi_definition",
        entityId: variables.id,
        oldValues: { is_required: variables.is_required },
        newValues: { is_required: !variables.is_required },
      });
      toast({
        title: `KPI ${kpi?.name ?? ""} ora e' ${!variables.is_required ? "obbligatorio" : "opzionale"}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (kpi: KpiRow) => {
    setEditingId(kpi.id);
    setEditForm({
      name: kpi.name,
      description: kpi.description ?? "",
      unit: kpi.unit,
      direction: kpi.direction,
      target_value: kpi.target_value != null ? String(kpi.target_value) : "",
      is_required: kpi.is_required ?? true,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const cancelCreate = () => {
    setShowCreateForm(false);
    setCreateForm(emptyForm);
  };

  const activeKpis = kpis.data ?? [];
  const activeCount = activeKpis.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>KPI di {areaName}</SheetTitle>
          <SheetDescription>
            {activeCount > 0
              ? `${activeCount} KPI attiv${activeCount === 1 ? "o" : "i"}`
              : "Nessun KPI attivo"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Empty state */}
          {!kpis.isLoading && activeCount === 0 && !showCreateForm && (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                Nessun KPI definito per {areaName}. Aggiungi il primo KPI.
              </p>
            </div>
          )}

          {/* KPI List */}
          {activeKpis.map((kpi) =>
            editingId === kpi.id ? (
              <div key={kpi.id} className="border border-border rounded-lg p-6 space-y-4">
                <KpiForm
                  form={editForm}
                  onChange={setEditForm}
                  onSubmit={() => updateMutation.mutate({ id: kpi.id, form: editForm })}
                  onCancel={cancelEdit}
                  isPending={updateMutation.isPending}
                  submitLabel="Salva"
                />
              </div>
            ) : (
              <div
                key={kpi.id}
                className="border border-border rounded-lg p-6 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{kpi.name}</span>
                        <Badge variant="outline" className="inline-flex items-center text-xs shrink-0">
                          {kpi.unit}
                        </Badge>
                        {kpi.direction === "up_is_good" ? (
                          <ArrowUp className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-green-600 shrink-0" />
                        )}
                        <Badge
                          variant={kpi.is_required ? "default" : "secondary"}
                          className="inline-flex items-center text-xs shrink-0"
                        >
                          {kpi.is_required ? "Obbligatorio" : "Opzionale"}
                        </Badge>
                      </div>
                      {kpi.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {kpi.description}
                        </p>
                      )}
                      {kpi.target_value != null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTarget(kpi.target_value, kpi.unit)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {confirmDeactivateId === kpi.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => deactivateMutation.mutate(kpi.id)}
                          disabled={deactivateMutation.isPending}
                        >
                          Conferma
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setConfirmDeactivateId(null)}
                        >
                          Annulla
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEdit(kpi)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setConfirmDeactivateId(kpi.id)}
                          title="Disattiva KPI (i dati storici saranno preservati)"
                        >
                          <EyeOff className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* is_required toggle inline */}
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <Label className="text-xs text-muted-foreground">Obbligatorio nel pre-meeting:</Label>
                  <Switch
                    checked={kpi.is_required ?? true}
                    onCheckedChange={() =>
                      toggleRequiredMutation.mutate({
                        id: kpi.id,
                        is_required: kpi.is_required ?? true,
                      })
                    }
                  />
                </div>
              </div>
            )
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="border border-border rounded-lg p-6 space-y-4">
              <KpiForm
                form={createForm}
                onChange={setCreateForm}
                onSubmit={() => createMutation.mutate(createForm)}
                onCancel={cancelCreate}
                isPending={createMutation.isPending}
                submitLabel="Salva"
              />
            </div>
          )}

          {/* Add Button */}
          {!showCreateForm && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi KPI
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function KpiForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
}: {
  form: KpiFormData;
  onChange: (form: KpiFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome KPI</Label>
        <Input
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="Es. Fatturato, NPS, Margine Operativo"
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Descrizione</Label>
        <Textarea
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="Descrizione opzionale del KPI"
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label>Unita' di misura</Label>
        <Input
          value={form.unit}
          onChange={(e) => onChange({ ...form, unit: e.target.value })}
          placeholder='Es. EUR, %, punti, #'
          required
        />
      </div>
      <div className="space-y-2">
        <Label>Direzione positiva</Label>
        <Select
          value={form.direction}
          onValueChange={(v) => onChange({ ...form, direction: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="up_is_good">Crescita positiva (up is good)</SelectItem>
            <SelectItem value="down_is_good">Calo positivo (down is good)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Valore target (opzionale)</Label>
        <Input
          type="number"
          value={form.target_value}
          onChange={(e) => onChange({ ...form, target_value: e.target.value })}
          placeholder="Es. 1000000"
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="kpi-required"
          checked={form.is_required}
          onCheckedChange={(checked) => onChange({ ...form, is_required: checked })}
        />
        <Label htmlFor="kpi-required" className="text-sm">
          Obbligatorio nel pre-meeting
        </Label>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={isPending || !form.name.trim() || !form.unit.trim()}>
          {isPending ? "Salvataggio..." : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
