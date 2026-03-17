import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  currentUserId: string;
  users: { id: string; full_name: string }[];
  meetings: { id: string; title: string }[];
}

function getQuarterEnd(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  const endMonth = q * 3;
  const end = new Date(date.getFullYear(), endMonth, 0);
  return end.toISOString().split("T")[0];
}

function getNextQuarterEnd(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  const nextQ = q + 1;
  if (nextQ > 4) {
    const end = new Date(date.getFullYear() + 1, 3, 0);
    return end.toISOString().split("T")[0];
  }
  const endMonth = nextQ * 3;
  const end = new Date(date.getFullYear(), endMonth, 0);
  return end.toISOString().split("T")[0];
}

export function CreateTaskDialog({ open, onOpenChange, tenantId, currentUserId, users, meetings }: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [deadlineType, setDeadlineType] = useState("next_meeting");
  const [linkedKpi, setLinkedKpi] = useState("none");
  const [customDate, setCustomDate] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setOwnerId(currentUserId);
      setDeadlineType("next_meeting");
      setLinkedKpi("none");
      setCustomDate("");
      setAreaFilter("all");
    }
  }, [open, currentUserId]);

  // Fetch functional areas for tenant
  const functionalAreas = useQuery({
    queryKey: ["create-task-areas", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("functional_areas")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // Fetch all KPIs for tenant
  const allKpis = useQuery({
    queryKey: ["create-task-kpis", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, functional_area_id, functional_areas(name)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((k: any) => ({
        id: k.id as string,
        name: k.name as string,
        functional_area_id: k.functional_area_id as string | null,
        area_name: (k.functional_areas as any)?.name ?? null,
      }));
    },
  });

  // Filter KPIs by selected area
  const filteredKpis = useMemo(() => {
    if (!allKpis.data) return [];
    if (areaFilter === "all") return allKpis.data;
    return allKpis.data.filter((k) => k.functional_area_id === areaFilter);
  }, [allKpis.data, areaFilter]);

  // Fetch next meeting for deadline calc
  const nextMeeting = useQuery({
    queryKey: ["board-next-meeting", tenantId],
    enabled: !!tenantId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("meetings")
        .select("id, scheduled_date")
        .eq("tenant_id", tenantId)
        .neq("status", "completed")
        .order("scheduled_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      let deadlineDate: string;

      if (deadlineType === "next_meeting" && nextMeeting.data) {
        deadlineDate = nextMeeting.data.scheduled_date;
      } else if (deadlineType === "end_quarter") {
        deadlineDate = getQuarterEnd(now);
      } else if (deadlineType === "custom") {
        deadlineDate = customDate;
      } else {
        deadlineDate = getNextQuarterEnd(now);
      }

      const meetingId = nextMeeting.data?.id ?? meetings[0]?.id;
      if (!meetingId) throw new Error("Nessuna riunione disponibile");

      const { error } = await supabase.from("board_tasks").insert({
        title: title.trim(),
        description: description.trim() || null,
        owner_user_id: ownerId,
        created_by_user_id: currentUserId,
        tenant_id: tenantId,
        meeting_id: meetingId,
        source: "pre_meeting",
        deadline_type: deadlineType,
        deadline_date: deadlineDate,
        status: "todo",
        linked_kpi_id: linkedKpi !== "none" ? linkedKpi : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-tasks"] });
      onOpenChange(false);
      toast({ title: "Task creato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const quarterEndLabel = getQuarterEnd(new Date());
  const nextQuarterEndLabel = getNextQuarterEnd(new Date());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nuovo Task</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="space-y-4 mt-6"
        >
          <div className="space-y-2">
            <Label htmlFor="task-title">Titolo</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Descrivi il task"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">Descrizione</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opzionale"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Area Funzionale filter */}
          <div className="space-y-2">
            <Label>Area Funzionale</Label>
            <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setLinkedKpi("none"); }}>
              <SelectTrigger>
                <SelectValue placeholder="Tutte le aree" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le aree</SelectItem>
                {functionalAreas.data?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Collega a KPI (filtered by area) */}
          <div className="space-y-2">
            <Label>Collega a KPI</Label>
            <Select value={linkedKpi} onValueChange={setLinkedKpi}>
              <SelectTrigger>
                <SelectValue placeholder="Nessuno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {filteredKpis.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.area_name ? `${k.area_name}: ${k.name}` : k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Scadenza</Label>
            <RadioGroup value={deadlineType} onValueChange={setDeadlineType} className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="next_meeting" id="dl-meeting" />
                <Label htmlFor="dl-meeting" className="font-normal text-sm cursor-pointer">
                  Prossima Riunione
                  {nextMeeting.data && (
                    <span className="text-muted-foreground ml-1">
                      ({new Date(nextMeeting.data.scheduled_date).toLocaleDateString("it-IT")})
                    </span>
                  )}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="end_quarter" id="dl-quarter" />
                <Label htmlFor="dl-quarter" className="font-normal text-sm cursor-pointer">
                  Fine Quarter
                  <span className="text-muted-foreground ml-1">
                    ({new Date(quarterEndLabel).toLocaleDateString("it-IT")})
                  </span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="next_quarter" id="dl-next" />
                <Label htmlFor="dl-next" className="font-normal text-sm cursor-pointer">
                  Quarter Successivo
                  <span className="text-muted-foreground ml-1">
                    ({new Date(nextQuarterEndLabel).toLocaleDateString("it-IT")})
                  </span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="dl-custom" />
                <Label htmlFor="dl-custom" className="font-normal text-sm cursor-pointer">
                  Data personalizzata
                </Label>
              </div>
            </RadioGroup>
            {deadlineType === "custom" && (
              <Input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                required
              />
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={createMutation.isPending || !title.trim() || (deadlineType === "custom" && !customDate)}
            >
              {createMutation.isPending ? "Creazione..." : "Crea Task"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
