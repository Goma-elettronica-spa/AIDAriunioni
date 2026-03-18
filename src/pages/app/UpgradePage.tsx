import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Lightbulb, TrendingUp, Scissors, Link2, Download, Trash2, Upload, FileDown, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
// Dialog import removed — using Sheet for creation
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";

// ---------- Type ----------
type UpgradeRequest = {
  id: string;
  tenant_id: string;
  meeting_id: string | null;
  created_by_user_id: string;
  owner_user_id: string;
  title: string;
  description: string | null;
  linked_kpi_id: string | null;
  reason_why: "revenue_generation" | "cost_cutting";
  value_unit: string;
  value_amount: number;
  reviewed_value_unit: string | null;
  reviewed_value_amount: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
  attachment_url: string | null;
  attachment_name: string | null;
  source: string;
};

type UpgradeCard = UpgradeRequest & {
  owner_name: string;
  kpi_name: string | null;
  kpi_area: string | null;
};

// ---------- Columns ----------
const columns = [
  { id: "proposed", label: "Proposed", color: "#7C3AED" },
  { id: "todo", label: "To Do", color: "var(--status-todo)" },
  { id: "waiting_for", label: "Waiting For", color: "var(--status-waiting)" },
  { id: "wip", label: "Work in Progress", color: "var(--status-wip)" },
  { id: "done", label: "Done", color: "var(--status-done)" },
  { id: "stuck", label: "Stuck", color: "var(--status-stuck)" },
  { id: "rejected", label: "Rejected", color: "#991B1B" },
];

// ---------- Helpers ----------
function ownerColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

function formatValue(amount: number, unit: string, unitLabel?: string): string {
  const fmt = amount.toLocaleString("it-IT", { maximumFractionDigits: 0 });
  if (unitLabel) return `${fmt} ${unitLabel}`;
  if (unit === "money") return `\u20AC${fmt}`;
  if (unit === "license_cost") return `\u20AC${fmt}/anno`;
  if (unit === "man_hours") return `${fmt} ore`;
  return `${fmt} ${unit}`;
}

function getUnitLabel(unit: string, unitOptions: { value: string; label: string }[]): string {
  const opt = unitOptions.find((o) => o.value === unit);
  return opt?.label ?? unit;
}

const reasonLabels: Record<string, string> = {
  revenue_generation: "Revenue Generation",
  cost_cutting: "Cost Cutting",
};

const statusLabels: Record<string, string> = {
  proposed: "Proposed",
  todo: "To Do",
  wip: "Work in Progress",
  done: "Done",
  stuck: "Stuck",
  waiting_for: "Waiting For",
  rejected: "Rejected",
};

// ---------- UpgradeCardComponent ----------
function UpgradeCardComponent({
  card,
  canDrag = false,
  isDragging = false,
  isBeingDragged = false,
  onClick,
  unitOptions = [],
}: {
  card: UpgradeCard;
  canDrag?: boolean;
  isDragging?: boolean;
  isBeingDragged?: boolean;
  onClick?: (c: UpgradeCard) => void;
  unitOptions?: { value: string; label: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: card.id,
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50 }
    : undefined;

  const initials = card.owner_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasReview =
    card.reviewed_value_amount != null && card.reviewed_value_amount !== undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      className={`bg-background border border-border rounded-lg p-3.5 space-y-2.5 transition-shadow cursor-pointer ${
        canDrag ? "active:cursor-grabbing" : ""
      } ${isDragging ? "shadow-lg opacity-90 rotate-1" : "hover:shadow-sm"} ${isBeingDragged ? "opacity-0" : ""}`}
      onClick={() => onClick?.(card)}
    >
      {/* Title */}
      <p className="text-sm font-bold text-foreground leading-snug">
        {card.title}
      </p>

      {/* Owner */}
      <div className="flex items-center gap-2">
        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
          style={{ backgroundColor: ownerColor(card.owner_user_id), color: "white" }}
        >
          {initials}
        </div>
        <Badge variant="secondary" className="inline-flex items-center text-[10px] font-normal py-0">
          {card.owner_name}
        </Badge>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* KPI collegata */}
        {card.kpi_name && (
          <Badge variant="secondary" className="inline-flex items-center text-[10px] font-normal gap-1 py-0">
            <Link2 className="h-2.5 w-2.5" />
            {card.kpi_name}
          </Badge>
        )}

        {/* Reason Why */}
        {card.reason_why === "revenue_generation" ? (
          <Badge
            variant="outline"
            className="inline-flex items-center text-[10px] font-normal gap-1 py-0 bg-green-50 text-green-700 border-green-200"
          >
            <TrendingUp className="h-2.5 w-2.5" />
            Revenue Generation
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="inline-flex items-center text-[10px] font-normal gap-1 py-0 bg-blue-50 text-blue-700 border-blue-200"
          >
            <Scissors className="h-2.5 w-2.5" />
            Cost Cutting
          </Badge>
        )}
      </div>

      {/* Valore aggiunto — always show value with unit badge */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasReview ? (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground line-through">
              {formatValue(card.value_amount, card.value_unit)}
            </p>
            <p className="text-xs font-bold text-foreground">
              {formatValue(card.reviewed_value_amount!, card.reviewed_value_unit ?? card.value_unit)}{" "}
              <span className="font-normal text-muted-foreground">(rivisto)</span>
            </p>
          </div>
        ) : (
          <p className="text-xs font-semibold text-foreground">
            {formatValue(card.value_amount, card.value_unit)}
          </p>
        )}
        <Badge variant="outline" className="inline-flex items-center text-[10px] font-normal py-0 bg-muted/50">
          {getUnitLabel(hasReview ? (card.reviewed_value_unit ?? card.value_unit) : card.value_unit, unitOptions)}
        </Badge>
      </div>

      {/* Description */}
      {card.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">
          {card.description}
        </p>
      )}
    </div>
  );
}

// ---------- UpgradeKanbanColumn ----------
function UpgradeKanbanColumn({
  column,
  cards,
  canDragAny,
  currentUserId,
  onCardClick,
  activeCardId,
  unitOptions = [],
}: {
  column: (typeof columns)[number];
  cards: UpgradeCard[];
  canDragAny: boolean;
  currentUserId?: string;
  onCardClick?: (c: UpgradeCard) => void;
  activeCardId?: string | null;
  unitOptions?: { value: string; label: string }[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const isHslColor = column.color.startsWith("var(");
  const barStyle = isHslColor
    ? { backgroundColor: `hsl(${column.color})` }
    : { backgroundColor: column.color };

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[250px] flex-1 flex flex-col rounded-lg transition-colors ${
        isOver ? "bg-muted/40" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-1 h-5 rounded-full shrink-0"
          style={barStyle}
        />
        <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {cards.length}
        </span>
      </div>

      <div className="space-y-2.5 flex-1 min-h-[120px]">
        {cards.map((card) => (
          <UpgradeCardComponent
            key={card.id}
            card={card}
            canDrag={canDragAny || card.owner_user_id === currentUserId}
            isBeingDragged={activeCardId === card.id}
            onClick={onCardClick}
            unitOptions={unitOptions}
          />
        ))}
        {cards.length === 0 && (
          <div className="border border-dashed border-border rounded-lg h-20 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Nessuna richiesta</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Main Page ----------
export default function UpgradePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;
  const isIOAdmin =
    user?.role === "org_admin" || user?.role === "information_officer";
  const canDragAny = isIOAdmin;

  // Filters
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [kpiFilter, setKpiFilter] = useState("all");

  // Dialog / Sheet
  const [createOpen, setCreateOpen] = useState(false);
  const [activeCard, setActiveCard] = useState<UpgradeCard | null>(null);
  const [selectedCard, setSelectedCard] = useState<UpgradeCard | null>(null);

  // Sheet edit state (IO/Admin fields)
  const [editReviewedValueUnit, setEditReviewedValueUnit] = useState<string>("");
  const [editReviewedValueAmount, setEditReviewedValueAmount] = useState<string>("");
  const [editReviewNote, setEditReviewNote] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Create dialog state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [newLinkedKpi, setNewLinkedKpi] = useState("none");
  const [newReasonWhy, setNewReasonWhy] = useState<string>("revenue_generation");
  const [newValueUnit, setNewValueUnit] = useState<string>("money");
  const [newValueAmount, setNewValueAmount] = useState<string>("");
  const [newAreaFilter, setNewAreaFilter] = useState<string>("all");
  const [newAttachmentFile, setNewAttachmentFile] = useState<File | null>(null);
  const [newAttachmentUploading, setNewAttachmentUploading] = useState(false);
  const [detailAttachmentUploading, setDetailAttachmentUploading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ---------- Queries ----------
  const upgradesQuery = useQuery({
    queryKey: ["upgrade-requests", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("upgrade_requests")
        .select(
          "id, tenant_id, meeting_id, created_by_user_id, owner_user_id, title, description, linked_kpi_id, reason_why, value_unit, value_amount, reviewed_value_unit, reviewed_value_amount, reviewed_by, reviewed_at, review_note, status, position, created_at, updated_at, attachment_url, attachment_name"
        )
        .eq("tenant_id", tenantId!);
      if (error) throw error;

      const rows = data as UpgradeRequest[];

      // Fetch owners
      const ownerIds = [...new Set(rows.map((r) => r.owner_user_id))];
      const { data: owners } = ownerIds.length
        ? await supabase.from("users").select("id, full_name").in("id", ownerIds)
        : { data: [] };
      const ownerMap = new Map<string, string>();
      for (const o of owners ?? []) ownerMap.set(o.id, o.full_name);

      // Fetch linked KPI names + area
      const kpiIds = rows
        .filter((r) => r.linked_kpi_id)
        .map((r) => r.linked_kpi_id!);
      const { data: kpis } = kpiIds.length
        ? await supabase
            .from("kpi_definitions")
            .select("id, name, area")
            .in("id", kpiIds)
        : { data: [] };
      const kpiMap = new Map<string, { name: string; area: string | null }>();
      for (const k of (kpis ?? []) as { id: string; name: string; area?: string | null }[])
        kpiMap.set(k.id, { name: k.name, area: k.area ?? null });

      return rows.map((r) => {
        const kpi = r.linked_kpi_id ? kpiMap.get(r.linked_kpi_id) : null;
        return {
          ...r,
          owner_name: ownerMap.get(r.owner_user_id) ?? "\u2014",
          kpi_name: kpi ? kpi.name : null,
          kpi_area: kpi ? kpi.area : null,
        } as UpgradeCard;
      });
    },
  });

  const tenantUsers = useQuery({
    queryKey: ["upgrade-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const kpiDefinitions = useQuery({
    queryKey: ["upgrade-kpi-defs", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, functional_areas(name)")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((k: any) => ({
        id: k.id as string,
        name: k.name as string,
        area: (k.functional_areas as any)?.name ?? null,
      })) as { id: string; name: string; area: string | null }[];
    },
  });

  const functionalAreas = useQuery({
    queryKey: ["upgrade-functional-areas", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("functional_areas")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const valueOptions = useQuery({
    queryKey: ["value-unit-options", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("value_unit_options")
        .select("*")
        .or(`tenant_id.eq.${tenantId},is_global.eq.true`)
        .order("label");
      return data ?? [];
    },
  });

  // Filtered KPIs based on area filter
  const filteredKpiDefinitions = useMemo(() => {
    if (!kpiDefinitions.data) return [];
    if (newAreaFilter === "all") return kpiDefinitions.data;
    // The kpi_definitions query joins functional_areas(name) so area is the name.
    // We need to match by functional_area_id. Let's find the area name from our areas list.
    const selectedArea = functionalAreas.data?.find((a) => a.id === newAreaFilter);
    if (!selectedArea) return kpiDefinitions.data;
    return kpiDefinitions.data.filter((k) => k.area === selectedArea.name);
  }, [kpiDefinitions.data, newAreaFilter, functionalAreas.data]);

  // ---------- Reset create dialog on open ----------
  useEffect(() => {
    if (createOpen) {
      setNewTitle("");
      setNewDescription("");
      setNewOwnerId(user?.id ?? "");
      setNewLinkedKpi("none");
      setNewReasonWhy("revenue_generation");
      setNewValueUnit("money");
      setNewValueAmount("");
      setNewAreaFilter("all");
      setNewAttachmentFile(null);
    }
  }, [createOpen, user?.id]);

  // ---------- Filtered + Grouped ----------
  const filtered = useMemo(() => {
    if (!upgradesQuery.data) return [];
    return upgradesQuery.data.filter((c) => {
      if (ownerFilter !== "all" && c.owner_user_id !== ownerFilter) return false;
      if (reasonFilter !== "all" && c.reason_why !== reasonFilter) return false;
      if (kpiFilter !== "all" && (c.linked_kpi_id ?? "none") !== kpiFilter)
        return false;
      return true;
    });
  }, [upgradesQuery.data, ownerFilter, reasonFilter, kpiFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, UpgradeCard[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const c of filtered) {
      if (map[c.status]) map[c.status].push(c);
      else if (map.proposed) map.proposed.push(c);
    }
    return map;
  }, [filtered]);

  // ---------- Summary ----------
  const summary = useMemo(() => {
    const all = filtered;
    let revenue = 0;
    let savings = 0;
    let hours = 0;
    let rejectedCount = 0;
    // Only count values for cards that have transitioned past "proposed" (i.e. reached "todo" or beyond)
    const countableStatuses = ["todo", "wip", "done", "stuck", "waiting_for"];
    for (const c of all) {
      if (c.status === "rejected") {
        rejectedCount++;
      }
      if (countableStatuses.includes(c.status)) {
        if (c.reason_why === "revenue_generation") {
          if (c.value_unit === "man_hours") hours += c.value_amount;
          else revenue += c.value_amount;
        } else {
          if (c.value_unit === "man_hours") hours += c.value_amount;
          else savings += c.value_amount;
        }
      }
    }
    return { total: all.length, revenue, savings, hours, rejectedCount };
  }, [filtered]);

  // ---------- Mutations ----------
  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      oldStatus,
    }: {
      id: string;
      status: string;
      oldStatus: string;
    }) => {
      const { error } = await (supabase.from as any)("upgrade_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["upgrade-requests"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "upgrade_request",
        entityId: variables.id,
        oldValues: { status: variables.oldStatus },
        newValues: { status: variables.status },
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Errore",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // First insert the record
      const { data: inserted, error } = await (supabase.from as any)("upgrade_requests").insert({
        tenant_id: tenantId,
        created_by_user_id: user?.id,
        owner_user_id: newOwnerId,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        linked_kpi_id: newLinkedKpi !== "none" ? newLinkedKpi : null,
        reason_why: newReasonWhy,
        value_unit: newValueUnit,
        value_amount: parseFloat(newValueAmount) || 0,
        status: "proposed",
        position: 0,
      }).select("id").single();
      if (error) throw error;

      // Upload attachment if present
      if (newAttachmentFile && inserted?.id) {
        setNewAttachmentUploading(true);
        const filePath = `${tenantId}/upgrades/${inserted.id}/${newAttachmentFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, newAttachmentFile, { upsert: true });
        if (uploadError) {
          console.error("Attachment upload error:", uploadError);
        } else {
          const { data: urlData } = supabase.storage
            .from("documents")
            .getPublicUrl(filePath);
          await (supabase.from as any)("upgrade_requests")
            .update({
              attachment_url: urlData?.publicUrl ?? filePath,
              attachment_name: newAttachmentFile.name,
            })
            .eq("id", inserted.id);
        }
        setNewAttachmentUploading(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upgrade-requests"] });
      setCreateOpen(false);
      toast({ title: "Richiesta creata" });
    },
    onError: (err: Error) => {
      toast({
        title: "Errore",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCard) return;
      const reviewedAmount = parseFloat(editReviewedValueAmount);
      const hasReviewedValue = !isNaN(reviewedAmount) && editReviewedValueUnit;
      const updatePayload: Record<string, unknown> = {
        status: editStatus,
        review_note: editReviewNote.trim() || null,
      };
      if (hasReviewedValue) {
        updatePayload.reviewed_value_unit = editReviewedValueUnit;
        updatePayload.reviewed_value_amount = reviewedAmount;
        updatePayload.reviewed_by = user?.id;
        updatePayload.reviewed_at = new Date().toISOString();
      }
      const { error } = await (supabase.from as any)("upgrade_requests")
        .update(updatePayload)
        .eq("id", selectedCard.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upgrade-requests"] });
      if (selectedCard) {
        writeAuditLog({
          tenantId: tenantId!,
          userId: user!.id,
          action: "update",
          entityType: "upgrade_request",
          entityId: selectedCard.id,
          oldValues: {
            status: selectedCard.status,
            reviewed_value_amount: selectedCard.reviewed_value_amount,
          },
          newValues: {
            status: editStatus,
            reviewed_value_amount: parseFloat(editReviewedValueAmount) || null,
            review_note: editReviewNote.trim() || null,
          },
        });
      }
      setSelectedCard(null);
      toast({ title: "Richiesta aggiornata" });
    },
    onError: (err: Error) => {
      toast({
        title: "Errore",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Delete upgrade request mutation
  const deleteUpgradeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("upgrade_requests")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upgrade-requests"] });
      if (selectedCard) {
        writeAuditLog({
          tenantId: tenantId!,
          userId: user!.id,
          action: "delete",
          entityType: "upgrade_request",
          entityId: selectedCard.id,
          oldValues: { title: selectedCard.title },
        });
      }
      setSelectedCard(null);
      setDeleteConfirmOpen(false);
      toast({ title: "Richiesta eliminata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // ---------- DnD ----------
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const card = upgradesQuery.data?.find((c) => c.id === event.active.id);
      if (card) setActiveCard(card);
    },
    [upgradesQuery.data]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over) return;

      const cardId = active.id as string;
      const card = upgradesQuery.data?.find((c) => c.id === cardId);
      if (!card) return;

      if (!canDragAny && card.owner_user_id !== user?.id) {
        toast({
          title: "Non puoi spostare richieste di altri utenti",
          variant: "destructive",
        });
        return;
      }

      const targetCol = columns.find((c) => c.id === over.id)?.id;
      if (!targetCol || targetCol === card.status) return;

      statusMutation.mutate({
        id: cardId,
        status: targetCol,
        oldStatus: card.status,
      });
    },
    [upgradesQuery.data, canDragAny, user?.id, statusMutation]
  );

  // ---------- Open detail sheet ----------
  const openCardDetail = useCallback((card: UpgradeCard) => {
    setSelectedCard(card);
    setEditReviewedValueUnit(card.reviewed_value_unit ?? card.value_unit);
    setEditReviewedValueAmount(
      card.reviewed_value_amount != null ? String(card.reviewed_value_amount) : ""
    );
    setEditReviewNote(card.review_note ?? "");
    setEditStatus(card.status);
  }, []);

  // ---------- Download .md ----------
  const downloadMarkdown = useCallback(
    (card: UpgradeCard) => {
      const reviewedLine =
        card.reviewed_value_amount != null
          ? `${formatValue(card.reviewed_value_amount, card.reviewed_value_unit ?? card.value_unit)}`
          : "Non ancora rivista";
      const md = `# ${card.title}

## Dettagli
- **Owner**: ${card.owner_name}
- **KPI**: ${card.kpi_name ?? "Nessuna"}
- **Reason Why**: ${reasonLabels[card.reason_why] ?? card.reason_why}
- **Area Funzionale**: ${card.kpi_area ?? "N/A"}

## Valore Aggiunto
- **Stima originale**: ${formatValue(card.value_amount, card.value_unit)}
- **Stima rivista**: ${reviewedLine}

## Descrizione
${card.description ?? "Nessuna descrizione"}

## Note IO
${card.review_note ?? "Nessuna nota"}

## Status
${statusLabels[card.status] ?? card.status}

---
Generato da Riunioni in Cloud il ${new Date().toLocaleDateString("it-IT")}
`;
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${card.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
    []
  );

  // ---------- Format summary values ----------
  const fmtEur = (n: number) =>
    `\u20AC${n.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;

  // ---------- Value unit options for selects ----------
  const unitSelectOptions = useMemo(() => {
    if (valueOptions.data && valueOptions.data.length > 0) {
      return valueOptions.data as { value: string; label: string }[];
    }
    // Fallback if table is empty
    return [
      { value: "money", label: "Soldi (\u20AC)" },
      { value: "license_cost", label: "Costo Licenza (\u20AC/anno)" },
      { value: "man_hours", label: "Ore Uomo" },
    ];
  }, [valueOptions.data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Upgrade</h1>
        <Button
          className="bg-black text-white hover:bg-black/90"
          onClick={() => setCreateOpen(true)}
        >
          <Lightbulb className="h-4 w-4 mr-2" />
          New Upgrade
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            {tenantUsers.data?.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Reason Why" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="revenue_generation">
              Revenue Generation
            </SelectItem>
            <SelectItem value="cost_cutting">Cost Cutting</SelectItem>
          </SelectContent>
        </Select>

        <Select value={kpiFilter} onValueChange={setKpiFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="KPI" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="none">Nessun KPI</SelectItem>
            {kpiDefinitions.data?.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.area ? `${k.area}: ${k.name}` : k.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 p-6 bg-muted/30 border border-border rounded-lg text-sm">
        <span className="font-medium text-foreground">
          {summary.total} richieste
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="text-green-700 font-medium">
          Revenue: {fmtEur(summary.revenue)}
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="text-blue-700 font-medium">
          Savings: {fmtEur(summary.savings)}
        </span>
        {summary.hours > 0 && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className="text-foreground font-medium">
              Ore: {summary.hours.toLocaleString("it-IT")}
            </span>
          </>
        )}
        {summary.rejectedCount > 0 && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className="text-red-800 font-medium">
              Rejected: {summary.rejectedCount}
            </span>
          </>
        )}
      </div>

      {/* Board */}
      {upgradesQuery.isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div key={col.id} className="min-w-[260px] flex-1">
              <Skeleton className="h-8 w-full mb-3" />
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {columns.map((col) => (
              <UpgradeKanbanColumn
                key={col.id}
                column={col}
                cards={grouped[col.id] ?? []}
                canDragAny={canDragAny}
                currentUserId={user?.id}
                onCardClick={openCardDetail}
                activeCardId={activeCard?.id}
                unitOptions={unitSelectOptions}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard && (
              <UpgradeCardComponent card={activeCard} isDragging unitOptions={unitSelectOptions} />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Upgrade</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4 mt-6"
          >
            {/* Titolo */}
            <div className="space-y-2">
              <Label htmlFor="upgrade-title">Titolo</Label>
              <Input
                id="upgrade-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Titolo della richiesta"
                required
              />
            </div>

            {/* Descrizione */}
            <div className="space-y-2">
              <Label htmlFor="upgrade-desc">Descrizione</Label>
              <Textarea
                id="upgrade-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Opzionale"
                rows={6}
                className="w-full"
              />
            </div>

            {/* Owner */}
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona owner" />
                </SelectTrigger>
                <SelectContent>
                  {tenantUsers.data?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Area Funzionale filter */}
            <div className="space-y-2">
              <Label>Area Funzionale</Label>
              <Select value={newAreaFilter} onValueChange={(v) => { setNewAreaFilter(v); setNewLinkedKpi("none"); }}>
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

            {/* Collega a KPI */}
            <div className="space-y-2">
              <Label>Collega a KPI</Label>
              <Select value={newLinkedKpi} onValueChange={setNewLinkedKpi}>
                <SelectTrigger>
                  <SelectValue placeholder="Nessuno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuno</SelectItem>
                  {filteredKpiDefinitions.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.area ? `${k.area}: ${k.name}` : k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reason Why */}
            <div className="space-y-2">
              <Label>Reason Why</Label>
              <RadioGroup
                value={newReasonWhy}
                onValueChange={setNewReasonWhy}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="revenue_generation"
                    id="new-reason-revenue"
                  />
                  <Label
                    htmlFor="new-reason-revenue"
                    className="font-normal text-sm cursor-pointer"
                  >
                    Revenue Generation
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cost_cutting" id="new-reason-cost" />
                  <Label
                    htmlFor="new-reason-cost"
                    className="font-normal text-sm cursor-pointer"
                  >
                    Cost Cutting
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Valore aggiunto */}
            <div className="space-y-2">
              <Label>Valore aggiunto</Label>
              <Select value={newValueUnit} onValueChange={setNewValueUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona unita" />
                </SelectTrigger>
                <SelectContent>
                  {unitSelectOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={newValueAmount}
                onChange={(e) => setNewValueAmount(e.target.value)}
                placeholder="Importo"
                min={0}
                required
              />
            </div>

            {/* Allegato */}
            <div className="space-y-2">
              <Label>Allegato</Label>
              {newAttachmentFile ? (
                <div className="flex items-center gap-2 p-3 border border-border rounded-md bg-muted/30">
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground truncate flex-1">{newAttachmentFile.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setNewAttachmentFile(null)}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-border rounded-md cursor-pointer hover:bg-muted/30 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Carica file (PDF, Word, Excel, immagini)</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setNewAttachmentFile(f);
                    }}
                  />
                </label>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setCreateOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={
                  createMutation.isPending ||
                  newAttachmentUploading ||
                  !newTitle.trim() ||
                  !newOwnerId ||
                  !newValueAmount
                }
              >
                {createMutation.isPending || newAttachmentUploading ? "Creazione..." : "Crea Richiesta"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Detail Sheet (right side) */}
      <Sheet
        open={!!selectedCard}
        onOpenChange={(open) => !open && setSelectedCard(null)}
      >
        <SheetContent
          side="right"
          className="w-[400px] sm:w-[500px] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Dettaglio Richiesta</SheetTitle>
          </SheetHeader>

          {selectedCard && (
            <div className="space-y-5 mt-6">
              {/* Title (read-only for all) */}
              <div className="space-y-2">
                <Label>Titolo</Label>
                <p className="text-sm font-bold text-foreground">{selectedCard.title}</p>
              </div>

              {/* Description (read-only for all) */}
              <div className="space-y-2">
                <Label>Descrizione</Label>
                <p className="text-sm text-muted-foreground">
                  {selectedCard.description || "Nessuna descrizione"}
                </p>
              </div>

              {/* Owner (read-only for all) */}
              <div className="space-y-2">
                <Label>Owner</Label>
                <p className="text-sm text-foreground">
                  {selectedCard.owner_name}
                </p>
              </div>

              {/* KPI collegata (read-only for all) */}
              <div className="space-y-2">
                <Label>KPI Collegata</Label>
                <p className="text-sm text-foreground">
                  {selectedCard.kpi_name ?? "Nessuno"}
                </p>
              </div>

              {/* Reason Why (read-only for all) */}
              <div className="space-y-2">
                <Label>Reason Why</Label>
                <div>
                  {selectedCard.reason_why === "revenue_generation" ? (
                    <Badge className="inline-flex items-center gap-1 bg-green-50 text-green-700 border-green-200">
                      <TrendingUp className="h-3 w-3" />
                      Revenue Generation
                    </Badge>
                  ) : (
                    <Badge className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                      <Scissors className="h-3 w-3" />
                      Cost Cutting
                    </Badge>
                  )}
                </div>
              </div>

              {/* Original value (read-only for all) */}
              <div className="space-y-2">
                <Label>Valore originale</Label>
                <p className="text-sm font-semibold text-foreground">
                  {formatValue(selectedCard.value_amount, selectedCard.value_unit)}
                </p>
              </div>

              {/* Reviewed value display (read-only, visible if reviewed) */}
              {selectedCard.reviewed_value_amount != null && !isIOAdmin && (
                <div className="space-y-2">
                  <Label>Valore rivisto</Label>
                  <p className="text-sm font-bold text-foreground">
                    {formatValue(
                      selectedCard.reviewed_value_amount,
                      selectedCard.reviewed_value_unit ?? selectedCard.value_unit
                    )}
                  </p>
                </div>
              )}

              {/* Status (read-only for non IO/admin) */}
              {!isIOAdmin && (
                <div className="space-y-2">
                  <Label>Stato</Label>
                  <div>
                    <Badge
                      variant="secondary"
                      className="inline-flex items-center text-xs"
                    >
                      {statusLabels[selectedCard.status] ?? selectedCard.status}
                    </Badge>
                  </div>
                </div>
              )}

              {/* IO/Admin editable fields */}
              {isIOAdmin && (
                <>
                  <div className="border-t border-border pt-4 space-y-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Revisione IO
                    </p>

                    {/* Reviewed value */}
                    <div className="space-y-2">
                      <Label>Valore rivisto</Label>
                      <Select
                        value={editReviewedValueUnit}
                        onValueChange={setEditReviewedValueUnit}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona unita" />
                        </SelectTrigger>
                        <SelectContent>
                          {unitSelectOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={editReviewedValueAmount}
                        onChange={(e) => setEditReviewedValueAmount(e.target.value)}
                        placeholder="Importo rivisto"
                        min={0}
                      />
                    </div>

                    {/* Review note */}
                    <div className="space-y-2">
                      <Label>Note IO</Label>
                      <Textarea
                        value={editReviewNote}
                        onChange={(e) => setEditReviewNote(e.target.value)}
                        placeholder="Commenti sulla revisione"
                        rows={3}
                      />
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <Label>Stato</Label>
                      <Select value={editStatus} onValueChange={setEditStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {columns.map((col) => (
                            <SelectItem key={col.id} value={col.id}>
                              {col.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Save button */}
                    <Button
                      className="w-full"
                      onClick={() => reviewMutation.mutate()}
                      disabled={reviewMutation.isPending}
                    >
                      {reviewMutation.isPending ? "Salvataggio..." : "Salva"}
                    </Button>
                  </div>
                </>
              )}

              {/* Review note display for non-IO users */}
              {!isIOAdmin && selectedCard.review_note && (
                <div className="space-y-2">
                  <Label>Note IO</Label>
                  <p className="text-sm text-muted-foreground">
                    {selectedCard.review_note}
                  </p>
                </div>
              )}

              {/* Attachment */}
              <div className="space-y-2">
                <Label>Allegato</Label>
                {selectedCard.attachment_url && selectedCard.attachment_name ? (
                  <div className="flex items-center gap-2 p-3 border border-border rounded-md bg-muted/30">
                    <FileDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a
                      href={selectedCard.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline truncate flex-1"
                    >
                      {selectedCard.attachment_name}
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessun allegato</p>
                )}
                {/* Replace/upload attachment */}
                {(isIOAdmin || selectedCard.created_by_user_id === user?.id) && (
                  <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-border rounded-md cursor-pointer hover:bg-muted/30 transition-colors">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {detailAttachmentUploading ? "Caricamento..." : selectedCard.attachment_url ? "Sostituisci allegato" : "Carica allegato"}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      disabled={detailAttachmentUploading}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f || !selectedCard) return;
                        setDetailAttachmentUploading(true);
                        try {
                          const filePath = `${tenantId}/upgrades/${selectedCard.id}/${f.name}`;
                          const { error: uploadError } = await supabase.storage
                            .from("documents")
                            .upload(filePath, f, { upsert: true });
                          if (uploadError) throw uploadError;
                          const { data: urlData } = supabase.storage
                            .from("documents")
                            .getPublicUrl(filePath);
                          await (supabase.from as any)("upgrade_requests")
                            .update({
                              attachment_url: urlData?.publicUrl ?? filePath,
                              attachment_name: f.name,
                            })
                            .eq("id", selectedCard.id);
                          queryClient.invalidateQueries({ queryKey: ["upgrade-requests"] });
                          toast({ title: "Allegato caricato" });
                          // Update the selected card locally
                          setSelectedCard({
                            ...selectedCard,
                            attachment_url: urlData?.publicUrl ?? filePath,
                            attachment_name: f.name,
                          });
                        } catch (err: any) {
                          toast({ title: "Errore upload", description: err.message, variant: "destructive" });
                        } finally {
                          setDetailAttachmentUploading(false);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Download .md button + Delete */}
              <div className="border-t border-border pt-4 space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => downloadMarkdown(selectedCard)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Scarica .md
                </Button>
                {(isIOAdmin || selectedCard.created_by_user_id === user?.id) && (
                  <Button
                    variant="ghost"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Elimina
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa richiesta?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La richiesta di upgrade verrà eliminata definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedCard && deleteUpgradeMutation.mutate(selectedCard.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUpgradeMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
