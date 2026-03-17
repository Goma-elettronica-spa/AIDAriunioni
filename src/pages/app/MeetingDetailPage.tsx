import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft, ChevronRight, Loader2, Pencil,
  Check, X, AlertTriangle, FileText, ListTodo, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";

import { OverviewTab } from "@/components/meeting-detail/OverviewTab";
import { MaterialeTab } from "@/components/meeting-detail/MaterialeTab";
import { PostMeetingTab } from "@/components/meeting-detail/PostMeetingTab";
import { TasksTab } from "@/components/meeting-detail/TasksTab";
import { UpgradeTab } from "@/components/meeting-detail/UpgradeTab";
import { KpiTab } from "@/components/meeting-detail/KpiTab";

const statusConfig: Record<string, { label: string; dotClass: string }> = {
  draft: { label: "Bozza", dotClass: "bg-[hsl(var(--status-todo))]" },
  pre_meeting: { label: "Prevista", dotClass: "bg-[hsl(var(--status-waiting))]" },
  in_progress: { label: "In Corso", dotClass: "bg-[hsl(var(--status-wip))]" },
  completed: { label: "Conclusa", dotClass: "bg-gray-700" },
};
const statusFlow = ["draft", "pre_meeting", "in_progress", "completed"];

interface GateStatus {
  hasSlideUpload: boolean;
  kpiCount: number;
  requiredKpiTotal: number;
  requiredKpiFilled: number;
  taskCount: number;
  hasAssignedKpis: boolean;
}

export default function MeetingDetailPage() {
  const { id: meetingId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "org_admin";

  const [activeTab, setActiveTab] = useState("overview");

  // Edit sheet state
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledDate, setEditScheduledDate] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editQuarter, setEditQuarter] = useState("");

  const meeting = useQuery({
    queryKey: ["meeting-detail", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", meetingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Determine if the meeting is in the future and the user is gated
  const isFuture = meeting.data
    ? new Date(meeting.data.scheduled_date) >= new Date(new Date().toDateString())
    : false;
  const isGated = isFuture && !isAdmin;

  // Fetch gate completion status for non-admin users on future meetings
  const gateStatus = useQuery<GateStatus>({
    queryKey: ["meeting-gate", meetingId, user?.id],
    enabled: !!meetingId && !!user?.id && isGated,
    queryFn: async () => {
      const uid = user!.id;
      const mid = meetingId!;

      // 1. Check slide_uploads
      const { count: slideCount } = await supabase
        .from("slide_uploads")
        .select("id", { count: "exact", head: true })
        .eq("meeting_id", mid)
        .eq("user_id", uid);

      // 2. Count kpi_entries for this meeting/user
      const { count: kpiCount } = await supabase
        .from("kpi_entries")
        .select("id", { count: "exact", head: true })
        .eq("meeting_id", mid)
        .eq("user_id", uid);

      // 3. Get user's functional areas then required KPIs
      const { data: userAreas } = await supabase
        .from("user_functional_areas")
        .select("functional_area_id")
        .eq("user_id", uid);

      let requiredKpiTotal = 0;
      let requiredKpiFilled = 0;
      const hasAssignedKpis = (userAreas?.length ?? 0) > 0;

      if (userAreas && userAreas.length > 0) {
        const areaIds = userAreas.map((a) => a.functional_area_id);

        const { data: requiredKpis } = await supabase
          .from("kpi_definitions")
          .select("id")
          .in("functional_area_id", areaIds)
          .eq("is_active", true)
          .eq("is_required", true);

        requiredKpiTotal = requiredKpis?.length ?? 0;

        if (requiredKpiTotal > 0) {
          const requiredKpiIds = requiredKpis!.map((k) => k.id);
          const { count: filledCount } = await supabase
            .from("kpi_entries")
            .select("id", { count: "exact", head: true })
            .eq("meeting_id", mid)
            .eq("user_id", uid)
            .in("kpi_id", requiredKpiIds);
          requiredKpiFilled = filledCount ?? 0;
        }
      }

      // 4. Count board_tasks with source='pre_meeting' for this meeting
      const { count: taskCount } = await supabase
        .from("board_tasks")
        .select("id", { count: "exact", head: true })
        .eq("meeting_id", mid)
        .eq("created_by_user_id", uid)
        .eq("source", "pre_meeting");

      return {
        hasSlideUpload: (slideCount ?? 0) > 0,
        kpiCount: kpiCount ?? 0,
        requiredKpiTotal,
        requiredKpiFilled,
        taskCount: taskCount ?? 0,
        hasAssignedKpis,
      };
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("meetings")
        .update({ status: newStatus })
        .eq("id", meetingId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("meetings")
        .update({
          title: editTitle.trim(),
          scheduled_date: editScheduledDate,
          pre_meeting_deadline: editDeadline || null,
          quarter: editQuarter.trim(),
        })
        .eq("id", meetingId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meetingId] });
      setEditOpen(false);
      toast({ title: "Riunione aggiornata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const openEditSheet = () => {
    if (!meeting.data) return;
    const m = meeting.data;
    setEditTitle(m.title ?? "");
    setEditScheduledDate(m.scheduled_date ?? "");
    setEditDeadline(m.pre_meeting_deadline ? m.pre_meeting_deadline.slice(0, 10) : "");
    setEditQuarter(m.quarter ?? "");
    setEditOpen(true);
  };

  if (meeting.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meeting.data) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-4">Riunione non trovata.</p>
        <Button variant="outline" onClick={() => navigate("/meetings")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Torna alle Riunioni
        </Button>
      </div>
    );
  }

  const m = meeting.data;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduled = new Date(m.scheduled_date);
  scheduled.setHours(0, 0, 0, 0);
  const isToday = today.getTime() === scheduled.getTime();
  const isPast = today > scheduled;
  const displayStatus = isPast ? "completed" : isToday ? "in_progress" : "pre_meeting";
  const sc = statusConfig[displayStatus] ?? statusConfig.draft;
  const nextIdx = statusFlow.indexOf(m.status) + 1;
  const nextStatus = nextIdx < statusFlow.length ? statusFlow[nextIdx] : null;
  const hasTranscriptOrSummary = !!(m.transcript_url || m.summary_text);

  // Gate check: determine if all requirements are met
  const gs = gateStatus.data;
  const allRequirementsMet = gs
    ? gs.hasSlideUpload &&
      gs.kpiCount >= 3 &&
      gs.taskCount >= 3 &&
      (gs.requiredKpiTotal === 0 || gs.requiredKpiFilled >= gs.requiredKpiTotal)
    : false;
  const showGate = isGated && !allRequirementsMet && !gateStatus.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground"
          onClick={() => navigate("/meetings")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Riunioni
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold text-foreground">{m.title}</h1>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={openEditSheet}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {!isPast && (
                <Badge
                  variant="secondary"
                  className={`inline-flex items-center text-xs gap-1.5 ${displayStatus === "completed" ? "bg-gray-800 text-white" : ""}`}
                >
                  <span className={`h-2 w-2 rounded-full ${displayStatus === "completed" ? "bg-gray-300" : sc.dotClass}`} />
                  {sc.label}
                </Badge>
              )}
              <Badge variant="outline" className="inline-flex items-center text-xs font-mono">
                {m.quarter}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(m.scheduled_date).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

        </div>
      </div>

      {/* Gate: loading state */}
      {isGated && gateStatus.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Gate: show requirements */}
      {showGate && gs && (
        <PreMeetingGate
          gateStatus={gs}
          meetingId={m.id}
          onNavigatePreMeeting={() => navigate(`/meetings/${m.id}/pre-meeting`)}
          onNavigateKpi={() => navigate("/kpi")}
        />
      )}

      {/* Gate passed or admin: show completed banner + normal tabs */}
      {isGated && allRequirementsMet && gs && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950/30">
          <Check className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <p className="text-sm font-medium text-green-700 dark:text-green-300">
            Preparazione completata!
          </p>
        </div>
      )}

      {/* Tabs — shown when NOT gated, or gate is passed */}
      {(!isGated || allRequirementsMet) && !gateStatus.isLoading && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none h-auto p-0 gap-0">
            {[
              { value: "overview", label: "Overview" },
              { value: "attachments", label: "Attachments" },
              { value: "post_meeting", label: "Post Meeting" },
              { value: "tasks", label: "Task" },
              { value: "upgrade", label: "Upgrade" },
              { value: "kpi", label: "KPI" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="pt-6">
            <TabsContent value="overview">
              <OverviewTab meeting={m} isAdmin={isAdmin} />
            </TabsContent>
            <TabsContent value="attachments">
              <MaterialeTab meeting={m} isAdmin={isAdmin} />
            </TabsContent>
            <TabsContent value="post_meeting">
              <PostMeetingTab meeting={m} />
            </TabsContent>
            <TabsContent value="tasks">
              <TasksTab
                meetingId={m.id}
                tenantId={m.tenant_id}
                isAdmin={isAdmin}
                transcriptUrl={m.transcript_url}
                summaryText={m.summary_text}
              />
            </TabsContent>
            <TabsContent value="upgrade">
              <UpgradeTab
                meetingId={m.id}
                tenantId={m.tenant_id}
                isAdmin={isAdmin}
                transcriptUrl={m.transcript_url}
                summaryText={m.summary_text}
              />
            </TabsContent>
            <TabsContent value="kpi">
              <KpiTab meetingId={m.id} tenantId={m.tenant_id} isAdmin={isAdmin} scheduledDate={m.scheduled_date} />
            </TabsContent>
          </div>
        </Tabs>
      )}

      {/* Edit Meeting Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Modifica Riunione</SheetTitle>
          </SheetHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editMutation.mutate();
            }}
            className="space-y-4 p-6"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-title">Titolo</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-date">Data Riunione</Label>
              <Input
                id="edit-date"
                type="date"
                value={editScheduledDate}
                onChange={(e) => setEditScheduledDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-deadline">Deadline Pre-Meeting</Label>
              <Input
                id="edit-deadline"
                type="date"
                value={editDeadline}
                onChange={(e) => setEditDeadline(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-quarter">Trimestre</Label>
              <Input
                id="edit-quarter"
                value={editQuarter}
                onChange={(e) => setEditQuarter(e.target.value)}
                placeholder="Q1-2026"
                required
              />
            </div>

            <div className="flex items-center gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={editMutation.isPending || !editTitle.trim() || !editScheduledDate}
              >
                {editMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ---------- Pre-Meeting Gate Component ---------- */

function PreMeetingGate({
  gateStatus,
  meetingId,
  onNavigatePreMeeting,
  onNavigateKpi,
}: {
  gateStatus: GateStatus;
  meetingId: string;
  onNavigatePreMeeting: () => void;
  onNavigateKpi: () => void;
}) {
  const { hasSlideUpload, kpiCount, requiredKpiTotal, requiredKpiFilled, taskCount, hasAssignedKpis } =
    gateStatus;

  const items: {
    label: string;
    detail: string;
    done: boolean;
    icon: React.ReactNode;
    warning?: string;
    warningAction?: { label: string; onClick: () => void };
  }[] = [
    {
      label: "Carica il tuo allegato PDF",
      detail: hasSlideUpload ? "Allegato caricato" : "Nessun allegato caricato",
      done: hasSlideUpload,
      icon: <FileText className="h-4 w-4" />,
    },
    {
      label: "Aggiorna almeno 3 KPI",
      detail: `${kpiCount}/3 completate`,
      done: kpiCount >= 3,
      icon: <BarChart3 className="h-4 w-4" />,
      warning: !hasAssignedKpis
        ? "Non hai KPI assegnate. Vai alla sezione KPI per configurarle."
        : undefined,
      warningAction: !hasAssignedKpis
        ? { label: "Vai ai KPI", onClick: onNavigateKpi }
        : undefined,
    },
    {
      label: "Crea almeno 3 TO DOs",
      detail: `${taskCount}/3 creati`,
      done: taskCount >= 3,
      icon: <ListTodo className="h-4 w-4" />,
    },
    {
      label: "KPI obbligatorie",
      detail:
        requiredKpiTotal === 0
          ? "Nessuna KPI obbligatoria"
          : `${requiredKpiFilled}/${requiredKpiTotal} completate`,
      done: requiredKpiTotal === 0 || requiredKpiFilled >= requiredKpiTotal,
      icon: <BarChart3 className="h-4 w-4" />,
    },
  ];

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-lg">
          Completa la preparazione per accedere alla riunione
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-3 p-6 rounded-lg bg-muted/30">
              <div
                className={`flex items-center justify-center h-6 w-6 rounded-full shrink-0 ${
                  item.done
                    ? "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
                    : "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                }`}
              >
                {item.done ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {item.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
              </div>
              {!item.done && !item.warning && (
                <Badge
                  variant="destructive"
                  className="inline-flex items-center text-xs shrink-0"
                >
                  Incompleto
                </Badge>
              )}
              {item.done && (
                <Badge
                  variant="secondary"
                  className="inline-flex items-center text-xs shrink-0 bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                >
                  Completato
                </Badge>
              )}
            </div>
            {item.warning && (
              <div className="flex items-center gap-2 ml-9 p-6 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
                  {item.warning}
                </p>
                {item.warningAction && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={item.warningAction.onClick}
                  >
                    {item.warningAction.label}
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}

        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <Button
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={onNavigatePreMeeting}
          >
            Vai al Pre-Meeting
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
