import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantName } from "@/hooks/use-tenant-name";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, Check, X, Loader2, TrendingUp, TrendingDown, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

export default function BriefPage() {
  const { id: meetingId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isIO = user?.role === "information_officer";
  const isAdmin = user?.role === "org_admin";

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionNote, setRejectionNote] = useState("");

  const meetingQuery = useQuery({
    queryKey: ["meeting-detail", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase.from("meetings").select("*").eq("id", meetingId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tenantName = useTenantName(meetingQuery.data?.tenant_id ?? null);

  const briefQuery = useQuery({
    queryKey: ["meeting-brief", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_briefs")
        .select("*")
        .eq("meeting_id", meetingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch stuck/waiting tasks for task section
  const tasksQuery = useQuery({
    queryKey: ["brief-tasks", meetingQuery.data?.tenant_id],
    enabled: !!meetingQuery.data?.tenant_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_tasks")
        .select("id, title, status, owner_user_id")
        .eq("tenant_id", meetingQuery.data!.tenant_id)
        .in("status", ["stuck", "waiting_for"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;

      const ownerIds = [...new Set(data.map((t) => t.owner_user_id))];
      let ownerMap = new Map<string, string>();
      if (ownerIds.length) {
        const { data: owners } = await supabase.from("users").select("id, full_name").in("id", ownerIds);
        for (const o of owners ?? []) ownerMap.set(o.id, o.full_name);
      }
      return data.map((t) => ({ ...t, owner_name: ownerMap.get(t.owner_user_id) ?? "—" }));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("meeting_briefs")
        .update({
          status: "approved",
          approved_by_user_id: user!.id,
          approved_at: new Date().toISOString(),
          rejection_note: null,
        })
        .eq("id", briefQuery.data!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-brief", meetingId] });
      toast({ title: "Brief approvato." });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (note: string) => {
      const { error } = await supabase
        .from("meeting_briefs")
        .update({
          status: "rejected",
          rejection_note: note,
          approved_by_user_id: null,
          approved_at: null,
        })
        .eq("id", briefQuery.data!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-brief", meetingId] });
      setRejectOpen(false);
      toast({ title: "Brief rifiutato." });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  if (meetingQuery.isLoading || briefQuery.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const meeting = meetingQuery.data;
  const brief = briefQuery.data;

  if (!meeting || !brief) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-4">Brief non trovato.</p>
        <Button variant="outline" onClick={() => navigate(`/meetings/${meetingId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Torna alla riunione
        </Button>
      </div>
    );
  }

  const completionStatus = (brief.completion_status ?? {}) as Record<string, { name: string; highlights: boolean; kpi: boolean; commitments: boolean; slides: boolean }>;
  const kpiSummary = (brief.kpi_summary ?? { increases: [], decreases: [] }) as { increases: Array<{ kpi: string; user: string; delta: number | null; delta_percent: number | null }>; decreases: Array<{ kpi: string; user: string; delta: number | null; delta_percent: number | null }> };

  const statusBadge = {
    pending_approval: { label: "In attesa di approvazione", dotClass: "bg-[hsl(var(--status-waiting))]" },
    approved: { label: "Approvato", dotClass: "bg-[hsl(var(--status-done))]" },
    rejected: { label: "Rifiutato", dotClass: "bg-[hsl(var(--status-stuck))]" },
    draft: { label: "Bozza", dotClass: "bg-[hsl(var(--status-todo))]" },
  }[brief.status] ?? { label: brief.status, dotClass: "bg-muted-foreground" };

  const CheckCell = ({ done }: { done: boolean }) =>
    done ? <Check className="h-3.5 w-3.5 mx-auto" style={{ color: "hsl(var(--status-done))" }} />
      : <X className="h-3.5 w-3.5 mx-auto" style={{ color: "hsl(var(--status-stuck))" }} />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back + Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => navigate(`/meetings/${meetingId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Riunione
        </Button>

        {isIO && brief.status === "pending_approval" && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="bg-[hsl(var(--status-done))] hover:bg-[hsl(var(--status-done))]/90 text-white"
            >
              {approveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
              Approva
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setRejectOpen(true)}
            >
              <X className="h-3.5 w-3.5 mr-1.5" />
              Rifiuta
            </Button>
          </div>
        )}
      </div>

      {/* Brief Header */}
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-semibold text-foreground">{meeting.title}</h1>
          <Badge variant="secondary" className="text-[10px] gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${statusBadge.dotClass}`} />
            {statusBadge.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(meeting.scheduled_date), "dd MMMM yyyy", { locale: it })}
          {tenantName ? ` • ${tenantName}` : ""}
          {" • "}
          {meeting.quarter}
        </p>
      </div>

      {/* Section: Stato Compilazione */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Stato Compilazione</h2>
        <p className="text-xs text-muted-foreground mb-2">
          {brief.completed_users}/{brief.total_users} dirigenti completati
        </p>
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Dirigente</TableHead>
                <TableHead className="text-xs text-center w-20">KPI</TableHead>
                <TableHead className="text-xs text-center w-20">Highlights</TableHead>
                <TableHead className="text-xs text-center w-20">Impegni</TableHead>
                <TableHead className="text-xs text-center w-20">Slide</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(completionStatus).map(([uid, cs]) => (
                <TableRow key={uid} className="hover:bg-muted/30">
                  <TableCell className="text-xs font-medium">{cs.name}</TableCell>
                  <TableCell className="text-center"><CheckCell done={cs.kpi} /></TableCell>
                  <TableCell className="text-center"><CheckCell done={cs.highlights} /></TableCell>
                  <TableCell className="text-center"><CheckCell done={cs.commitments} /></TableCell>
                  <TableCell className="text-center"><CheckCell done={cs.slides} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Section: KPI Critici */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">KPI Critici</h2>
        {(!kpiSummary.increases.length && !kpiSummary.decreases.length) ? (
          <p className="text-xs text-muted-foreground">Nessun dato KPI disponibile.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {kpiSummary.increases.length > 0 && (
              <Card className="border border-border">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" style={{ color: "hsl(var(--status-done))" }} />
                    Miglioramenti
                  </p>
                  <div className="space-y-2">
                    {kpiSummary.increases.map((kpi, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-foreground">{kpi.kpi}</span>
                          <span className="text-muted-foreground ml-1">({kpi.user})</span>
                        </div>
                        <span className="font-mono font-medium" style={{ color: "hsl(var(--status-done))" }}>
                          +{Number(kpi.delta).toFixed(1)}
                          {kpi.delta_percent !== null && ` (${Number(kpi.delta_percent).toFixed(1)}%)`}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {kpiSummary.decreases.length > 0 && (
              <Card className="border border-border">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" style={{ color: "hsl(var(--status-stuck))" }} />
                    Peggioramenti
                  </p>
                  <div className="space-y-2">
                    {kpiSummary.decreases.map((kpi, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-foreground">{kpi.kpi}</span>
                          <span className="text-muted-foreground ml-1">({kpi.user})</span>
                        </div>
                        <span className="font-mono font-medium" style={{ color: "hsl(var(--status-stuck))" }}>
                          {Number(kpi.delta).toFixed(1)}
                          {kpi.delta_percent !== null && ` (${Number(kpi.delta_percent).toFixed(1)}%)`}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>

      {/* Section: Temi Principali */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">Temi Principali</h2>
        {brief.highlights_summary ? (
          <Card className="border border-border">
            <CardContent className="p-4">
              <p className="text-sm text-foreground leading-relaxed">{brief.highlights_summary}</p>
            </CardContent>
          </Card>
        ) : (
          <p className="text-xs text-muted-foreground">Nessun highlight disponibile.</p>
        )}
      </section>

      {/* Section: Task Aperti */}
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Task Aperti
          <Badge variant="secondary" className="text-[10px] ml-2">{brief.open_tasks_count}</Badge>
        </h2>
        {tasksQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !tasksQuery.data?.length ? (
          <p className="text-xs text-muted-foreground">Nessun task bloccato o in attesa.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {tasksQuery.data.map((task) => (
              <div key={task.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  {task.status === "stuck" ? (
                    <AlertTriangle className="h-3 w-3" style={{ color: "hsl(var(--status-stuck))" }} />
                  ) : (
                    <Clock className="h-3 w-3" style={{ color: "hsl(var(--status-waiting))" }} />
                  )}
                  <span className="font-medium text-foreground">{task.title}</span>
                </div>
                <span className="text-muted-foreground">{task.owner_name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <div className="border-t border-border pt-4 text-xs text-muted-foreground">
        Generato il {brief.generated_at ? format(new Date(brief.generated_at), "dd/MM/yyyy HH:mm", { locale: it }) : "—"}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rifiuta Brief</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Motivo del rifiuto…"
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Annulla</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate(rejectionNote)}
              disabled={!rejectionNote.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Conferma Rifiuto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
