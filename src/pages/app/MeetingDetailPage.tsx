import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

import { OverviewTab } from "@/components/meeting-detail/OverviewTab";
import { VideoTab } from "@/components/meeting-detail/VideoTab";
import { HighlightsTab } from "@/components/meeting-detail/HighlightsTab";
import { KpiTab } from "@/components/meeting-detail/KpiTab";
import { CommitmentsTab } from "@/components/meeting-detail/CommitmentsTab";
import { DocumentsTab } from "@/components/meeting-detail/DocumentsTab";
import { TasksTab } from "@/components/meeting-detail/TasksTab";

const statusConfig: Record<string, { label: string; dotClass: string }> = {
  draft: { label: "Bozza", dotClass: "bg-[hsl(var(--status-todo))]" },
  pre_meeting: { label: "Pre-Meeting", dotClass: "bg-[hsl(var(--status-waiting))]" },
  in_progress: { label: "In Corso", dotClass: "bg-[hsl(var(--status-wip))]" },
  completed: { label: "Completata", dotClass: "bg-[hsl(var(--status-done))]" },
};
const statusFlow = ["draft", "pre_meeting", "in_progress", "completed"];

export default function MeetingDetailPage() {
  const { id: meetingId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "org_admin";

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
  const sc = statusConfig[m.status] ?? statusConfig.draft;
  const nextIdx = statusFlow.indexOf(m.status) + 1;
  const nextStatus = nextIdx < statusFlow.length ? statusFlow[nextIdx] : null;

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
              <Badge variant="secondary" className="text-xs gap-1.5">
                <span className={`h-2 w-2 rounded-full ${sc.dotClass}`} />
                {sc.label}
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">{m.quarter}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(m.scheduled_date).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

          {isAdmin && nextStatus && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => statusMutation.mutate(nextStatus)}
              disabled={statusMutation.isPending}
            >
              {statusConfig[nextStatus]?.label ?? nextStatus}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start border-b border-border bg-transparent rounded-none h-auto p-0 gap-0">
          {[
            { value: "overview", label: "Overview" },
            { value: "video", label: "Video" },
            { value: "highlights", label: "Highlights" },
            { value: "kpi", label: "KPI" },
            { value: "commitments", label: "Impegni" },
            { value: "documents", label: "Documenti" },
            { value: "tasks", label: "Task" },
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
          <TabsContent value="video">
            <VideoTab meeting={m} isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="highlights">
            <HighlightsTab meetingId={m.id} tenantId={m.tenant_id} />
          </TabsContent>
          <TabsContent value="kpi">
            <KpiTab meetingId={m.id} tenantId={m.tenant_id} />
          </TabsContent>
          <TabsContent value="commitments">
            <CommitmentsTab meetingId={m.id} tenantId={m.tenant_id} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab meeting={m} isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="tasks">
            <TasksTab meetingId={m.id} tenantId={m.tenant_id} isAdmin={isAdmin} transcriptUrl={m.transcript_url} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
