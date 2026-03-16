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
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { KanbanColumn } from "@/components/board/KanbanColumn";
import { TaskCard } from "@/components/board/TaskCard";
import { CreateTaskDialog } from "@/components/board/CreateTaskDialog";

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  owner_user_id: string;
  owner_name: string;
  deadline_date: string;
  deadline_type: string;
  source: string;
  linked_kpi_id: string | null;
  kpi_name: string | null;
  meeting_id: string;
  created_by_user_id: string;
};

export const columns = [
  { id: "todo", label: "To Do", color: "var(--status-todo)" },
  { id: "wip", label: "Work in Progress", color: "var(--status-wip)" },
  { id: "done", label: "Done", color: "var(--status-done)" },
  { id: "stuck", label: "Stuck", color: "var(--status-stuck)" },
  { id: "waiting_for", label: "Waiting For", color: "var(--status-waiting)" },
];

export function ownerColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
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

const statusLabels: Record<string, string> = {
  todo: "To Do",
  wip: "Work in Progress",
  done: "Done",
  stuck: "Stuck",
  waiting_for: "Waiting For",
};

const sourceLabels: Record<string, string> = {
  pre_meeting: "Pre-Meeting",
  ai_suggested: "AI Suggerito",
  manual: "Manuale",
};

export default function BoardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;
  const canDragAny = user?.role === "org_admin" || user?.role === "information_officer";

  const [ownerFilter, setOwnerFilter] = useState("all");
  const [deadlineFilter, setDeadlineFilter] = useState("all");
  const [meetingFilter, setMeetingFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<BoardTask | null>(null);
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);

  // Sheet edit state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOwnerId, setEditOwnerId] = useState("");
  const [editDeadlineType, setEditDeadlineType] = useState("");
  const [editDeadlineDate, setEditDeadlineDate] = useState("");
  const [editLinkedKpi, setEditLinkedKpi] = useState("none");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Fetch tasks
  const tasks = useQuery({
    queryKey: ["board-tasks", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_tasks")
        .select("id, title, description, status, owner_user_id, deadline_date, deadline_type, source, linked_kpi_id, meeting_id, created_by_user_id")
        .eq("tenant_id", tenantId!);
      if (error) throw error;

      // Fetch owners
      const ownerIds = [...new Set(data.map((t) => t.owner_user_id))];
      const { data: owners } = ownerIds.length
        ? await supabase.from("users").select("id, full_name").in("id", ownerIds)
        : { data: [] };
      const ownerMap = new Map<string, string>();
      for (const o of owners ?? []) ownerMap.set(o.id, o.full_name);

      // Fetch linked KPI names
      const kpiIds = data.filter((t) => t.linked_kpi_id).map((t) => t.linked_kpi_id!);
      const { data: kpis } = kpiIds.length
        ? await supabase.from("kpi_definitions").select("id, name").in("id", kpiIds)
        : { data: [] };
      const kpiMap = new Map<string, string>();
      for (const k of kpis ?? []) kpiMap.set(k.id, k.name);

      return data.map((t) => ({
        ...t,
        owner_name: ownerMap.get(t.owner_user_id) ?? "—",
        kpi_name: t.linked_kpi_id ? (kpiMap.get(t.linked_kpi_id) ?? null) : null,
      })) as BoardTask[];
    },
  });

  // Fetch tenant users for filters & create dialog
  const tenantUsers = useQuery({
    queryKey: ["board-users", tenantId],
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

  // Fetch meetings for filter
  const meetings = useQuery({
    queryKey: ["board-meetings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title")
        .eq("tenant_id", tenantId!)
        .order("scheduled_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  // KPIs for selected task's owner (in sheet)
  const sheetKpis = useQuery({
    queryKey: ["sheet-kpis", tenantId, editOwnerId],
    enabled: !!tenantId && !!editOwnerId && !!selectedTask,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .eq("user_id", editOwnerId)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Creator name for sheet
  const creatorName = useMemo(() => {
    if (!selectedTask || !tenantUsers.data) return "—";
    const creator = tenantUsers.data.find((u) => u.id === selectedTask.created_by_user_id);
    return creator?.full_name ?? "—";
  }, [selectedTask, tenantUsers.data]);

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("board_tasks")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-tasks"] });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Update task mutation (sheet)
  const updateTaskMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTask) return;

      let deadlineDate = editDeadlineDate;
      const now = new Date();
      if (editDeadlineType === "end_quarter") {
        deadlineDate = getQuarterEnd(now);
      } else if (editDeadlineType === "next_quarter") {
        deadlineDate = getNextQuarterEnd(now);
      }

      const { error } = await supabase
        .from("board_tasks")
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          owner_user_id: editOwnerId,
          deadline_type: editDeadlineType,
          deadline_date: deadlineDate,
          linked_kpi_id: editLinkedKpi !== "none" ? editLinkedKpi : null,
        })
        .eq("id", selectedTask.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-tasks"] });
      setSelectedTask(null);
      toast({ title: "Task aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Open task detail sheet
  const openTaskDetail = useCallback((task: BoardTask) => {
    setSelectedTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditOwnerId(task.owner_user_id);
    setEditDeadlineType(task.deadline_type);
    setEditDeadlineDate(task.deadline_date);
    setEditLinkedKpi(task.linked_kpi_id ?? "none");
  }, []);

  // Permission check for editing
  const canEdit = useMemo(() => {
    if (!selectedTask || !user) return false;
    if (user.role === "org_admin" || user.role === "information_officer") return true;
    return selectedTask.created_by_user_id === user.id;
  }, [selectedTask, user]);

  // Filtered tasks
  const filtered = useMemo(() => {
    if (!tasks.data) return [];
    return tasks.data.filter((t) => {
      if (ownerFilter !== "all" && t.owner_user_id !== ownerFilter) return false;
      if (deadlineFilter !== "all" && t.deadline_type !== deadlineFilter) return false;
      if (meetingFilter !== "all" && t.meeting_id !== meetingFilter) return false;
      return true;
    });
  }, [tasks.data, ownerFilter, deadlineFilter, meetingFilter]);

  // Group by column
  const grouped = useMemo(() => {
    const map: Record<string, BoardTask[]> = {};
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
      const task = tasks.data?.find((t) => t.id === event.active.id);
      if (task) setActiveTask(task);
    },
    [tasks.data]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const task = tasks.data?.find((t) => t.id === taskId);
      if (!task) return;

      // Check permission
      if (!canDragAny && task.owner_user_id !== user?.id) {
        toast({ title: "Non puoi spostare task di altri utenti", variant: "destructive" });
        return;
      }

      // Determine target column
      const targetCol = columns.find((c) => c.id === over.id)?.id;
      if (!targetCol || targetCol === task.status) return;

      statusMutation.mutate({ id: taskId, status: targetCol });
    },
    [tasks.data, canDragAny, user?.id, statusMutation]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Board</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Task
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

        <Select value={deadlineFilter} onValueChange={setDeadlineFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Scadenza" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="next_meeting">Prossima Riunione</SelectItem>
            <SelectItem value="end_quarter">Fine Quarter</SelectItem>
            <SelectItem value="next_quarter">Quarter Successivo</SelectItem>
            <SelectItem value="custom">Personalizzata</SelectItem>
          </SelectContent>
        </Select>

        {(meetings.data?.length ?? 0) > 0 && (
          <Select value={meetingFilter} onValueChange={setMeetingFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Riunione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              {meetings.data?.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Board */}
      {tasks.isLoading ? (
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
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={grouped[col.id] ?? []}
                canDragAny={canDragAny}
                currentUserId={user?.id}
                onTaskClick={openTaskDetail}
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask && <TaskCard task={activeTask} isDragging />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Dialog */}
      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId!}
        currentUserId={user?.id ?? ""}
        users={tenantUsers.data ?? []}
        meetings={meetings.data ?? []}
      />

      {/* Task Detail Sheet */}
      <Sheet open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <SheetContent side="right" className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Dettaglio Task</SheetTitle>
          </SheetHeader>

          {selectedTask && (
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
                  <p className="text-sm text-foreground">{selectedTask.owner_name}</p>
                )}
              </div>

              {/* Deadline type */}
              <div className="space-y-2">
                <Label>Scadenza</Label>
                {canEdit ? (
                  <>
                    <RadioGroup value={editDeadlineType} onValueChange={setEditDeadlineType} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="next_meeting" id="sheet-dl-meeting" />
                        <Label htmlFor="sheet-dl-meeting" className="font-normal text-sm cursor-pointer">
                          Prossima Riunione
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="end_quarter" id="sheet-dl-quarter" />
                        <Label htmlFor="sheet-dl-quarter" className="font-normal text-sm cursor-pointer">
                          Fine Quarter
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="next_quarter" id="sheet-dl-next" />
                        <Label htmlFor="sheet-dl-next" className="font-normal text-sm cursor-pointer">
                          Quarter Successivo
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="custom" id="sheet-dl-custom" />
                        <Label htmlFor="sheet-dl-custom" className="font-normal text-sm cursor-pointer">
                          Data personalizzata
                        </Label>
                      </div>
                    </RadioGroup>
                    {(editDeadlineType === "custom" || editDeadlineType === "next_meeting") && (
                      <Input
                        type="date"
                        value={editDeadlineDate}
                        onChange={(e) => setEditDeadlineDate(e.target.value)}
                      />
                    )}
                  </>
                ) : (
                  <p className="text-sm text-foreground">
                    {editDeadlineType === "next_meeting"
                      ? "Prossima Riunione"
                      : editDeadlineType === "end_quarter"
                        ? "Fine Quarter"
                        : editDeadlineType === "next_quarter"
                          ? "Quarter Successivo"
                          : "Personalizzata"}
                    {editDeadlineDate && (
                      <span className="text-muted-foreground ml-2">
                        ({new Date(editDeadlineDate).toLocaleDateString("it-IT")})
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Linked KPI */}
              <div className="space-y-2">
                <Label>KPI Collegato</Label>
                {canEdit ? (
                  <Select value={editLinkedKpi} onValueChange={setEditLinkedKpi}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nessuno" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuno</SelectItem>
                      {sheetKpis.data?.map((k) => (
                        <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-foreground">
                    {selectedTask.kpi_name ?? "Nessuno"}
                  </p>
                )}
              </div>

              {/* Status (read-only) */}
              <div className="space-y-2">
                <Label>Stato</Label>
                <div>
                  <Badge variant="secondary" className="inline-flex items-center text-xs">
                    {statusLabels[selectedTask.status] ?? selectedTask.status}
                  </Badge>
                </div>
              </div>

              {/* Created by (read-only) */}
              <div className="space-y-2">
                <Label>Creato da</Label>
                <p className="text-sm text-muted-foreground">{creatorName}</p>
              </div>

              {/* Source (read-only) */}
              <div className="space-y-2">
                <Label>Origine</Label>
                <p className="text-sm text-muted-foreground">
                  {sourceLabels[selectedTask.source] ?? selectedTask.source}
                </p>
              </div>

              {/* Save button */}
              {canEdit && (
                <Button
                  className="w-full"
                  onClick={() => updateTaskMutation.mutate()}
                  disabled={updateTaskMutation.isPending || !editTitle.trim()}
                >
                  {updateTaskMutation.isPending ? "Salvataggio..." : "Salva"}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
