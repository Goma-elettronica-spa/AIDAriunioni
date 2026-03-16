import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Sparkles, FileText } from "lucide-react";

interface Props {
  meetingId: string;
  tenantId: string;
}

const statusConfig: Record<string, { label: string; dotClass: string }> = {
  todo: { label: "Da fare", dotClass: "bg-[hsl(var(--status-todo))]" },
  wip: { label: "In corso", dotClass: "bg-[hsl(var(--status-wip))]" },
  done: { label: "Fatto", dotClass: "bg-[hsl(var(--status-done))]" },
  stuck: { label: "Bloccato", dotClass: "bg-[hsl(var(--status-stuck))]" },
  waiting_for: { label: "In attesa", dotClass: "bg-[hsl(var(--status-waiting))]" },
};

const deadlineLabels: Record<string, string> = {
  next_meeting: "Prossima riunione",
  end_quarter: "Fine quarter",
  next_quarter: "Quarter successivo",
};

export function TasksTab({ meetingId, tenantId }: Props) {
  const tasks = useQuery({
    queryKey: ["detail-tasks", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_tasks")
        .select("id, title, status, owner_user_id, deadline_date, deadline_type, source")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId)
        .order("created_at");
      if (error) throw error;

      const ownerIds = [...new Set(data.map((t) => t.owner_user_id))];
      const { data: owners } = ownerIds.length
        ? await supabase.from("users").select("id, full_name").in("id", ownerIds)
        : { data: [] };
      const ownerMap = new Map(owners?.map((o) => [o.id, o.full_name]) ?? []);

      return data.map((t) => ({
        ...t,
        owner_name: ownerMap.get(t.owner_user_id) ?? "—",
      }));
    },
  });

  if (tasks.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!tasks.data?.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nessun task per questa riunione.</p>;
  }

  return (
    <div className="border border-border rounded-lg divide-y divide-border">
      {tasks.data.map((task) => {
        const sc = statusConfig[task.status] ?? statusConfig.todo;
        return (
          <div key={task.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                {task.source === "ai_suggested" ? (
                  <Sparkles className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{task.owner_name}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <Badge variant="secondary" className="text-[10px] gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${sc.dotClass}`} />
                {sc.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1 hidden sm:flex">
                <CalendarDays className="h-2.5 w-2.5" />
                {deadlineLabels[task.deadline_type] ?? task.deadline_type}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
