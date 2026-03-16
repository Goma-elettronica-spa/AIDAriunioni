import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantName } from "@/hooks/use-tenant-name";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ClipboardCheck,
  ListTodo,
  TrendingDown,
  ArrowRight,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

const meetingStatusConfig: Record<string, { label: string; dotClass: string }> = {
  draft: { label: "Bozza", dotClass: "bg-muted-foreground" },
  pre_meeting: { label: "Pre-Meeting", dotClass: "bg-[hsl(var(--status-waiting))]" },
  in_progress: { label: "In Corso", dotClass: "bg-[hsl(var(--status-wip))]" },
  completed: { label: "Completata", dotClass: "bg-[hsl(var(--status-done))]" },
};

const taskStatusConfig: Record<string, { label: string; dotClass: string }> = {
  todo: { label: "Da fare", dotClass: "bg-[hsl(var(--status-todo))]" },
  wip: { label: "In corso", dotClass: "bg-[hsl(var(--status-wip))]" },
  done: { label: "Fatto", dotClass: "bg-[hsl(var(--status-done))]" },
  stuck: { label: "Bloccato", dotClass: "bg-[hsl(var(--status-stuck))]" },
  waiting_for: { label: "In attesa", dotClass: "bg-[hsl(var(--status-waiting))]" },
};

function daysUntil(dateStr: string) {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${className}`} />;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const tenantName = useTenantName(user?.tenant_id ?? null);
  const navigate = useNavigate();
  const tenantId = user?.tenant_id;

  // Next meeting
  const nextMeeting = useQuery({
    queryKey: ["dashboard-next-meeting", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title, scheduled_date, status, pre_meeting_deadline")
        .eq("tenant_id", tenantId!)
        .neq("status", "completed")
        .order("scheduled_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Pre-meeting progress: dirigenti who submitted highlights / total dirigenti
  const preMeetingProgress = useQuery({
    queryKey: ["dashboard-premeeting", tenantId, nextMeeting.data?.id],
    enabled: !!tenantId && !!nextMeeting.data?.id,
    queryFn: async () => {
      const meetingId = nextMeeting.data!.id;
      const [highlightUsers, totalDirigenti] = await Promise.all([
        supabase
          .from("highlights")
          .select("user_id")
          .eq("meeting_id", meetingId)
          .eq("tenant_id", tenantId!),
        supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("role", "dirigente"),
      ]);
      const uniqueUsers = new Set(highlightUsers.data?.map((h) => h.user_id) ?? []);
      return {
        completed: uniqueUsers.size,
        total: totalDirigenti.count ?? 0,
      };
    },
  });

  // Open tasks count
  const openTasks = useQuery({
    queryKey: ["dashboard-open-tasks", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("board_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
        .in("status", ["todo", "wip", "stuck", "waiting_for"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // KPI in decline
  const kpiDecline = useQuery({
    queryKey: ["dashboard-kpi-decline", tenantId, nextMeeting.data?.id],
    enabled: !!tenantId && !!nextMeeting.data?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("kpi_entries")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!)
        .eq("meeting_id", nextMeeting.data!.id)
        .eq("is_improved", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Recent tasks
  const recentTasks = useQuery({
    queryKey: ["dashboard-recent-tasks", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_tasks")
        .select("id, title, status, deadline_date, owner_user_id")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;

      if (!data?.length) return [];

      // Fetch owner names
      const ownerIds = [...new Set(data.map((t) => t.owner_user_id))];
      const { data: owners } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", ownerIds);

      const ownerMap = new Map(owners?.map((o) => [o.id, o.full_name]) ?? []);
      return data.map((t) => ({
        ...t,
        owner_name: ownerMap.get(t.owner_user_id) ?? "—",
      }));
    },
  });

  const meeting = nextMeeting.data;
  const progress = preMeetingProgress.data;
  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <div className="space-y-section-gap">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Benvenuto, {user?.full_name}
        </h1>
        <div className="flex items-center gap-2 mt-1">
          {tenantName && (
            <span className="text-sm text-muted-foreground">{tenantName}</span>
          )}
          <Badge variant="secondary" className="text-xs font-normal">
            {user?.role}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Prossima Riunione */}
        <Card className="border border-border">
          <CardContent className="p-card-padding">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-md bg-muted">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            {nextMeeting.isLoading ? (
              <Skeleton className="h-8 w-24 mb-1" />
            ) : meeting ? (
              <>
                <p className="text-lg font-semibold font-mono text-foreground">
                  {new Date(meeting.scheduled_date).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "short",
                  })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {daysUntil(meeting.scheduled_date) > 0
                    ? `tra ${daysUntil(meeting.scheduled_date)} giorni`
                    : daysUntil(meeting.scheduled_date) === 0
                      ? "Oggi"
                      : "Passata"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nessuna programmata</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">Prossima Riunione</p>
          </CardContent>
        </Card>

        {/* Pre-Meeting */}
        <Card className="border border-border">
          <CardContent className="p-card-padding">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-md bg-muted">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            {preMeetingProgress.isLoading || nextMeeting.isLoading ? (
              <Skeleton className="h-8 w-16 mb-1" />
            ) : progress ? (
              <>
                <p className="text-3xl font-semibold font-mono text-foreground">
                  {progress.completed}/{progress.total}
                </p>
                <Progress value={progressPercent} className="h-1 mt-2" />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">Pre-Meeting Completati</p>
          </CardContent>
        </Card>

        {/* Task Aperti */}
        <Card className="border border-border">
          <CardContent className="p-card-padding">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-md bg-muted">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            {openTasks.isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <p className="text-3xl font-semibold font-mono text-foreground">
                {openTasks.data}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1">Task Aperti</p>
          </CardContent>
        </Card>

        {/* KPI in Calo */}
        <Card className="border border-border">
          <CardContent className="p-card-padding">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-md bg-muted">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            {kpiDecline.isLoading || nextMeeting.isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <p
                className="text-3xl font-semibold font-mono"
                style={{
                  color:
                    (kpiDecline.data ?? 0) > 0
                      ? "hsl(var(--status-stuck))"
                      : "hsl(var(--foreground))",
                }}
              >
                {kpiDecline.data ?? 0}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-1">KPI in Calo</p>
          </CardContent>
        </Card>
      </div>

      {/* Next Meeting Card */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Prossima Riunione</h2>
        {nextMeeting.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : meeting ? (
          <Card className="border border-border">
            <CardContent className="p-card-padding">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {meeting.title}
                    </h3>
                    {meetingStatusConfig[meeting.status] && (
                      <Badge variant="secondary" className="text-xs font-normal gap-1.5">
                        <StatusDot
                          className={meetingStatusConfig[meeting.status].dotClass}
                        />
                        {meetingStatusConfig[meeting.status].label}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      Data:{" "}
                      <span className="text-foreground font-medium">
                        {new Date(meeting.scheduled_date).toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </span>
                    <span>
                      Deadline pre-meeting:{" "}
                      <span className="text-foreground font-medium">
                        {new Date(meeting.pre_meeting_deadline).toLocaleDateString(
                          "it-IT",
                          { day: "2-digit", month: "long" }
                        )}
                      </span>
                    </span>
                  </div>
                  {progress && progress.total > 0 && (
                    <div className="max-w-xs">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Completamento pre-meeting</span>
                        <span className="font-mono">
                          {progress.completed}/{progress.total}
                        </span>
                      </div>
                      <Progress value={progressPercent} className="h-1.5" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {meeting.status === "pre_meeting" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(`/meetings/${meeting.id}/pre-meeting`)
                      }
                    >
                      Vai al Pre-Meeting
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/meetings/${meeting.id}`)}
                  >
                    Vedi Dettaglio
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-dashed border-border">
            <CardContent className="p-card-padding text-center py-12">
              <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Nessuna riunione programmata
              </p>
              {user?.role === "org_admin" && (
                <Button size="sm" onClick={() => navigate("/meetings")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crea la prima riunione
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Tasks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Task Recenti</h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => navigate("/board")}
          >
            Vedi Board completa
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>

        {recentTasks.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !recentTasks.data?.length ? (
          <Card className="border border-dashed border-border">
            <CardContent className="p-card-padding text-center py-8">
              <p className="text-sm text-muted-foreground">Nessun task presente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {recentTasks.data.map((task) => {
              const status = taskStatusConfig[task.status] ?? {
                label: task.status,
                dotClass: "bg-muted-foreground",
              };
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{task.owner_name}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="flex items-center gap-1.5">
                      <StatusDot className={status.dotClass} />
                      <span className="text-xs text-muted-foreground">
                        {status.label}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                      {new Date(task.deadline_date).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
