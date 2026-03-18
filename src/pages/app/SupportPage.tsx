import { useState, useMemo, useCallback } from "react";
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
import { Plus, Trash2, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types ──────────────────────────────────────────────────────────────────

type SupportRequest = {
  id: string;
  tenant_id: string;
  created_by_user_id: string;
  owner_user_id: string;
  owner_name: string;
  title: string;
  description: string | null;
  section: string | null;
  status: string;
  parent_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

// ── Columns (same as BoardPage) ────────────────────────────────────────────

const columns = [
  { id: "todo", label: "To Do", color: "var(--status-todo)" },
  { id: "waiting_for", label: "Waiting For", color: "var(--status-waiting)" },
  { id: "wip", label: "Work in Progress", color: "var(--status-wip)" },
  { id: "done", label: "Done", color: "var(--status-done)" },
  { id: "stuck", label: "Stuck", color: "var(--status-stuck)" },
];

const statusLabels: Record<string, string> = {
  todo: "To Do",
  wip: "Work in Progress",
  done: "Done",
  stuck: "Stuck",
  waiting_for: "Waiting For",
};

// ── Section config ─────────────────────────────────────────────────────────

const sectionLabels: Record<string, string> = {
  dashboard: "Dashboard",
  kpi: "KPI",
  riunioni: "Riunioni",
  todos: "TO DOs",
  upgrade: "Upgrade",
  team: "Team",
  organigramma: "Organigramma",
  audit_log: "Audit Log",
  support: "Support",
  nessuna: "Nessuna sezione",
};

const sectionColors: Record<string, string> = {
  dashboard: "bg-gray-100 text-gray-700 border-gray-200",
  kpi: "bg-green-50 text-green-700 border-green-200",
  riunioni: "bg-blue-50 text-blue-700 border-blue-200",
  todos: "bg-purple-50 text-purple-700 border-purple-200",
  upgrade: "bg-orange-50 text-orange-700 border-orange-200",
  team: "bg-indigo-50 text-indigo-700 border-indigo-200",
  organigramma: "bg-pink-50 text-pink-700 border-pink-200",
  audit_log: "bg-red-50 text-red-700 border-red-200",
  support: "bg-yellow-50 text-yellow-700 border-yellow-200",
  nessuna: "bg-gray-50 text-gray-500 border-gray-200",
};

const sectionOptions = [
  "dashboard", "kpi", "riunioni", "todos", "upgrade",
  "team", "organigramma", "audit_log", "support", "nessuna",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function ownerColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

// ── Support Card ───────────────────────────────────────────────────────────

interface SupportCardProps {
  item: SupportRequest;
  canDrag?: boolean;
  isDragging?: boolean;
  isBeingDragged?: boolean;
  onClick?: (item: SupportRequest) => void;
  subtaskProgress?: { done: number; total: number } | null;
}

function SupportCard({ item, canDrag = false, isDragging = false, isBeingDragged = false, onClick, subtaskProgress }: SupportCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.id,
    disabled: !canDrag,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50 }
    : undefined;

  const initials = item.owner_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasSubtasks = subtaskProgress && subtaskProgress.total > 0;
  const subtaskPercent = hasSubtasks
    ? Math.round((subtaskProgress.done / subtaskProgress.total) * 100)
    : 0;
  const allDone = hasSubtasks && subtaskProgress.done === subtaskProgress.total;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      className={`bg-background border border-border rounded-lg p-3.5 space-y-2.5 transition-shadow cursor-pointer ${
        canDrag ? "active:cursor-grabbing" : ""
      } ${isDragging ? "shadow-lg opacity-90 rotate-1" : "hover:shadow-sm"} ${isBeingDragged ? "opacity-0" : ""}`}
      onClick={() => onClick?.(item)}
    >
      {/* Title */}
      <p className="text-sm font-medium text-foreground leading-snug">{item.title}</p>

      {/* Owner */}
      <div className="flex items-center gap-2">
        <div
          className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
          style={{
            backgroundColor: ownerColor(item.owner_user_id),
            color: "white",
          }}
        >
          {initials}
        </div>
        <span className="text-xs text-muted-foreground truncate">{item.owner_name}</span>
      </div>

      {/* Description truncated */}
      {item.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Sezione badge */}
        {item.section && (
          <Badge
            variant="outline"
            className={`inline-flex items-center text-[10px] font-normal gap-1 py-0 ${sectionColors[item.section] ?? sectionColors.nessuna}`}
          >
            {sectionLabels[item.section] ?? item.section}
          </Badge>
        )}
      </div>

      {/* Subtask progress bar */}
      {hasSubtasks && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {subtaskProgress.done}/{subtaskProgress.total} sotto-task
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {subtaskPercent}%
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-gray-400"}`}
              style={{ width: `${subtaskPercent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Support Column ─────────────────────────────────────────────────────────

interface SupportColumnProps {
  column: (typeof columns)[number];
  items: SupportRequest[];
  canDragAny: boolean;
  currentUserId?: string;
  onItemClick?: (item: SupportRequest) => void;
  subtaskProgressMap?: Map<string, { done: number; total: number }>;
  activeItemId?: string | null;
}

function SupportColumn({
  column,
  items,
  canDragAny,
  currentUserId,
  onItemClick,
  subtaskProgressMap,
  activeItemId,
}: SupportColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`min-w-[250px] flex-1 flex flex-col rounded-lg transition-colors ${
        isOver ? "bg-muted/40" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div
          className="w-1 h-5 rounded-full shrink-0"
          style={{ backgroundColor: `hsl(${column.color})` }}
        />
        <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
        <span className="text-xs text-muted-foreground font-mono ml-auto">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="space-y-2.5 flex-1 min-h-[120px]">
        {items.map((item) => (
          <SupportCard
            key={item.id}
            item={item}
            canDrag={canDragAny || item.owner_user_id === currentUserId}
            isBeingDragged={activeItemId === item.id}
            onClick={onItemClick}
            subtaskProgress={subtaskProgressMap?.get(item.id) ?? null}
          />
        ))}
        {items.length === 0 && (
          <div className="border border-dashed border-border rounded-lg h-20 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Nessuna richiesta</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SupportPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;
  const canDragAny = user?.role === "org_admin" || user?.role === "information_officer";

  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<SupportRequest | null>(null);
  const [selectedItem, setSelectedItem] = useState<SupportRequest | null>(null);

  // Sheet edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOwnerId, setEditOwnerId] = useState("");
  const [editSection, setEditSection] = useState("nessuna");

  // Create form state
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createOwnerId, setCreateOwnerId] = useState("");
  const [createSection, setCreateSection] = useState("nessuna");

  // Subtask input state
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Fetch support requests
  const items = useQuery({
    queryKey: ["support-requests", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("support_requests")
        .select("id, tenant_id, created_by_user_id, owner_user_id, title, description, section, status, parent_id, position, created_at, updated_at")
        .eq("tenant_id", tenantId!);
      if (error) throw error;

      // Fetch owners
      const ownerIds = [...new Set((data as any[]).map((t: any) => t.owner_user_id))];
      const { data: owners } = ownerIds.length
        ? await supabase.from("users").select("id, full_name").in("id", ownerIds)
        : { data: [] };
      const ownerMap = new Map<string, string>();
      for (const o of owners ?? []) ownerMap.set(o.id, o.full_name);

      return (data as any[]).map((t: any) => ({
        ...t,
        owner_name: ownerMap.get(t.owner_user_id) ?? "—",
      })) as SupportRequest[];
    },
  });

  // Compute subtask progress map
  const subtaskProgressMap = useMemo(() => {
    if (!items.data) return new Map<string, { done: number; total: number }>();
    const map = new Map<string, { done: number; total: number }>();
    for (const t of items.data) {
      if (t.parent_id) {
        const current = map.get(t.parent_id) ?? { done: 0, total: 0 };
        current.total += 1;
        if (t.status === "done") current.done += 1;
        map.set(t.parent_id, current);
      }
    }
    return map;
  }, [items.data]);

  // Fetch tenant users
  const tenantUsers = useQuery({
    queryKey: ["support-users", tenantId],
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

  // Creator name for sheet
  const creatorName = useMemo(() => {
    if (!selectedItem || !tenantUsers.data) return "—";
    const creator = tenantUsers.data.find((u) => u.id === selectedItem.created_by_user_id);
    return creator?.full_name ?? "—";
  }, [selectedItem, tenantUsers.data]);

  // Subtasks for selected item
  const subtasksQuery = useQuery({
    queryKey: ["support-subtasks", selectedItem?.id],
    enabled: !!selectedItem,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("support_requests")
        .select("id, title, status")
        .eq("parent_id", selectedItem!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as { id: string; title: string; status: string }[];
    },
  });

  // Status mutation (drag)
  const statusMutation = useMutation({
    mutationFn: async ({ id, status, oldStatus }: { id: string; status: string; oldStatus: string }) => {
      const { error } = await (supabase.from as any)("support_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
      queryClient.invalidateQueries({ queryKey: ["support-subtasks"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "support_request",
        entityId: variables.id,
        oldValues: { status: variables.oldStatus },
        newValues: { status: variables.status },
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Update item mutation (sheet)
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) return;
      const { error } = await (supabase.from as any)("support_requests")
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          owner_user_id: editOwnerId,
          section: editSection,
        })
        .eq("id", selectedItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
      if (selectedItem) {
        writeAuditLog({
          tenantId: tenantId!,
          userId: user!.id,
          action: "update",
          entityType: "support_request",
          entityId: selectedItem.id,
          oldValues: { title: selectedItem.title, description: selectedItem.description, owner_user_id: selectedItem.owner_user_id, section: selectedItem.section },
          newValues: { title: editTitle.trim(), description: editDescription.trim() || null, owner_user_id: editOwnerId, section: editSection },
        });
      }
      setSelectedItem(null);
      toast({ title: "Richiesta aggiornata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("support_requests").insert({
        title: createTitle.trim(),
        description: createDescription.trim() || null,
        owner_user_id: createOwnerId || user?.id,
        created_by_user_id: user?.id,
        tenant_id: tenantId,
        section: createSection,
        status: "todo",
        position: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
      setCreateOpen(false);
      toast({ title: "Richiesta creata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Create subtask mutation
  const createSubtaskMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!selectedItem || !tenantId) return;
      const { error } = await (supabase.from as any)("support_requests").insert({
        title: title.trim(),
        parent_id: selectedItem.id,
        tenant_id: tenantId,
        owner_user_id: selectedItem.owner_user_id,
        created_by_user_id: user?.id ?? selectedItem.created_by_user_id,
        section: selectedItem.section,
        status: "todo",
        position: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
      setNewSubtaskTitle("");
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Toggle subtask status
  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "done" ? "todo" : "done";
      const { error } = await (supabase.from as any)("support_requests")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Delete subtask
  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      const { error } = await (supabase.from as any)("support_requests")
        .delete()
        .eq("id", subtaskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-subtasks"] });
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
      toast({ title: "Sotto-task eliminato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Delete item
  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // Delete subtasks first
      await (supabase.from as any)("support_requests").delete().eq("parent_id", itemId);
      const { error } = await (supabase.from as any)("support_requests").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
      if (selectedItem) {
        writeAuditLog({
          tenantId: tenantId!,
          userId: user!.id,
          action: "delete",
          entityType: "support_request",
          entityId: selectedItem.id,
          oldValues: { title: selectedItem.title },
        });
      }
      setSelectedItem(null);
      setDeleteConfirmOpen(false);
      toast({ title: "Richiesta eliminata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Open detail sheet
  const openDetail = useCallback((item: SupportRequest) => {
    setSelectedItem(item);
    setEditTitle(item.title);
    setEditDescription(item.description ?? "");
    setEditOwnerId(item.owner_user_id);
    setEditSection(item.section ?? "nessuna");
    setNewSubtaskTitle("");
  }, []);

  // Open create sheet
  const openCreate = useCallback(() => {
    setCreateTitle("");
    setCreateDescription("");
    setCreateOwnerId(user?.id ?? "");
    setCreateSection("nessuna");
    setCreateOpen(true);
  }, [user?.id]);

  // Permission checks
  const canEdit = useMemo(() => {
    if (!selectedItem || !user) return false;
    if (user.role === "org_admin" || user.role === "information_officer") return true;
    return selectedItem.created_by_user_id === user.id;
  }, [selectedItem, user]);

  const canDelete = useMemo(() => {
    if (!selectedItem || !user) return false;
    if (user.role === "org_admin" || user.role === "information_officer") return true;
    return selectedItem.created_by_user_id === user.id;
  }, [selectedItem, user]);

  // Filtered items — only top-level (parent_id is null)
  const filtered = useMemo(() => {
    if (!items.data) return [];
    return items.data.filter((t) => {
      if (t.parent_id) return false;
      if (ownerFilter !== "all" && t.owner_user_id !== ownerFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      return true;
    });
  }, [items.data, ownerFilter, statusFilter]);

  // Group by column
  const grouped = useMemo(() => {
    const map: Record<string, SupportRequest[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const t of filtered) {
      if (map[t.status]) map[t.status].push(t);
      else if (map.todo) map.todo.push(t);
    }
    return map;
  }, [filtered]);

  // DnD handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const item = items.data?.find((t) => t.id === event.active.id);
      if (item) setActiveItem(item);
    },
    [items.data]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItem(null);
      const { active, over } = event;
      if (!over) return;

      const itemId = active.id as string;
      const item = items.data?.find((t) => t.id === itemId);
      if (!item) return;

      // Check permission
      if (!canDragAny && item.owner_user_id !== user?.id) {
        toast({ title: "Non puoi spostare richieste di altri utenti", variant: "destructive" });
        return;
      }

      const targetCol = columns.find((c) => c.id === over.id)?.id;
      if (!targetCol || targetCol === item.status) return;

      statusMutation.mutate({ id: itemId, status: targetCol, oldStatus: item.status });
    },
    [items.data, canDragAny, user?.id, statusMutation]
  );

  // Subtask summary
  const subtaskList = subtasksQuery.data ?? [];
  const subtaskDone = subtaskList.filter((s) => s.status === "done").length;
  const subtaskTotal = subtaskList.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Support</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Richiesta
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
              <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            {columns.map((col) => (
              <SelectItem key={col.id} value={col.id}>{col.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Board */}
      {items.isLoading ? (
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
              <SupportColumn
                key={col.id}
                column={col}
                items={grouped[col.id] ?? []}
                canDragAny={canDragAny}
                currentUserId={user?.id}
                onItemClick={openDetail}
                subtaskProgressMap={subtaskProgressMap}
                activeItemId={activeItem?.id}
              />
            ))}
          </div>

          <DragOverlay>
            {activeItem && (
              <SupportCard
                item={activeItem}
                isDragging
                subtaskProgress={subtaskProgressMap.get(activeItem.id) ?? null}
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuova Richiesta</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4 mt-6"
          >
            <div className="space-y-2">
              <Label htmlFor="support-title">Titolo</Label>
              <Input
                id="support-title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Descrivi la richiesta"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-desc">Descrizione</Label>
              <Textarea
                id="support-desc"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="Opzionale"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={createOwnerId} onValueChange={setCreateOwnerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tenantUsers.data?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sezione</Label>
              <Select value={createSection} onValueChange={setCreateSection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sectionOptions.map((s) => (
                    <SelectItem key={s} value={s}>{sectionLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>
                Annulla
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || !createTitle.trim()}
              >
                {createMutation.isPending ? "Creazione..." : "Crea Richiesta"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Detail Sheet */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Dettaglio Richiesta</SheetTitle>
          </SheetHeader>

          {selectedItem && (
            <div className="space-y-5 mt-6">
              {/* Title */}
              <div className="space-y-2">
                <Label>Titolo</Label>
                {canEdit ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                ) : (
                  <p className="text-sm text-foreground">{editTitle}</p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Descrizione</Label>
                {canEdit ? (
                  <Textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Nessuna descrizione"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {editDescription || "Nessuna descrizione"}
                  </p>
                )}
              </div>

              {/* Owner */}
              <div className="space-y-2">
                <Label>Owner</Label>
                {canEdit ? (
                  <Select value={editOwnerId} onValueChange={setEditOwnerId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantUsers.data?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-foreground">{selectedItem.owner_name}</p>
                )}
              </div>

              {/* Sezione */}
              <div className="space-y-2">
                <Label>Sezione</Label>
                {canEdit ? (
                  <Select value={editSection} onValueChange={setEditSection}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sectionOptions.map((s) => (
                        <SelectItem key={s} value={s}>{sectionLabels[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <Badge
                      variant="outline"
                      className={`inline-flex items-center text-xs font-normal ${sectionColors[editSection] ?? sectionColors.nessuna}`}
                    >
                      {sectionLabels[editSection] ?? editSection}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Status (read-only) */}
              <div className="space-y-2">
                <Label>Stato</Label>
                <div>
                  <Badge variant="secondary" className="inline-flex items-center text-xs">
                    {statusLabels[selectedItem.status] ?? selectedItem.status}
                  </Badge>
                </div>
              </div>

              {/* Created by (read-only) */}
              <div className="space-y-2">
                <Label>Creato da</Label>
                <p className="text-sm text-muted-foreground">{creatorName}</p>
              </div>

              {/* Sotto-task section */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label>Sotto-task</Label>
                  {subtaskTotal > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {subtaskDone}/{subtaskTotal} completati
                    </span>
                  )}
                </div>

                {/* Subtask list */}
                {subtaskList.length > 0 && (
                  <div className="space-y-1.5">
                    {subtaskList.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2 p-2 border border-border rounded-md">
                        <Checkbox
                          checked={sub.status === "done"}
                          onCheckedChange={() =>
                            toggleSubtaskMutation.mutate({ id: sub.id, currentStatus: sub.status })
                          }
                        />
                        <span
                          className={`text-sm flex-1 ${
                            sub.status === "done" ? "line-through text-muted-foreground" : "text-foreground"
                          }`}
                        >
                          {sub.title}
                        </span>
                        {canDelete && (
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                            title="Elimina sotto-task"
                            onClick={() => deleteSubtaskMutation.mutate(sub.id)}
                          >
                            <XIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {subtaskList.length === 0 && !subtasksQuery.isLoading && (
                  <p className="text-xs text-muted-foreground">Nessun sotto-task</p>
                )}

                {/* Add subtask input */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Aggiungi sotto-task..."
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSubtaskTitle.trim()) {
                        e.preventDefault();
                        createSubtaskMutation.mutate(newSubtaskTitle);
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!newSubtaskTitle.trim() || createSubtaskMutation.isPending}
                    onClick={() => {
                      if (newSubtaskTitle.trim()) {
                        createSubtaskMutation.mutate(newSubtaskTitle);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Save button */}
              {canEdit && (
                <Button
                  className="w-full"
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending || !editTitle.trim()}
                >
                  {updateMutation.isPending ? "Salvataggio..." : "Salva"}
                </Button>
              )}

              {/* Delete button */}
              {canDelete && (
                <Button
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina richiesta
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sei sicuro di voler eliminare questa richiesta?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La richiesta e tutti i sotto-task verranno eliminati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && deleteMutation.mutate(selectedItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
