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
import { Plus, Sparkles, FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
      const ownerMap = new Map(owners?.map((o) => [o.id, o.full_name]) ?? []);

      // Fetch linked KPI names
      const kpiIds = data.filter((t) => t.linked_kpi_id).map((t) => t.linked_kpi_id!);
      const { data: kpis } = kpiIds.length
        ? await supabase.from("kpi_definitions").select("id, name").in("id", kpiIds)
        : { data: [] };
      const kpiMap = new Map(kpis?.map((k) => [k.id, k.name]) ?? []);

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
                onStatusChange={(taskId, status) =>
                  statusMutation.mutate({ id: taskId, status })
                }
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
    </div>
  );
}
