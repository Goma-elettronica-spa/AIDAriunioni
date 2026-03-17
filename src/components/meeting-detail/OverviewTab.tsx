import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Check, X, FileText, Loader2, Send, RefreshCw, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import type { Json } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
  isAdmin: boolean;
}

export function OverviewTab({ meeting, isAdmin }: Props) {
  const tenantId = meeting.tenant_id;
  const meetingId = meeting.id;
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch dirigenti
  const dirigenti = useQuery({
    queryKey: ["overview-dirigenti", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, job_title")
        .eq("tenant_id", tenantId)
        .eq("role", "dirigente")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch completion data (KPI, Allegati, Tasks)
  const completionData = useQuery({
    queryKey: ["overview-completion", meetingId, tenantId],
    enabled: !!dirigenti.data,
    queryFn: async () => {
      const userIds = dirigenti.data!.map((d) => d.id);
      if (!userIds.length) return { kpiEntries: new Set<string>(), slides: new Set<string>(), tasksByUser: {} as Record<string, { assigned: number; completed: number }> };

      const [kpiEntries, slides, boardTasks] = await Promise.all([
        supabase.from("kpi_entries").select("user_id").eq("meeting_id", meetingId).in("user_id", userIds),
        supabase.from("slide_uploads").select("user_id").eq("meeting_id", meetingId).in("user_id", userIds),
        supabase.from("board_tasks").select("owner_user_id, status").eq("meeting_id", meetingId).in("owner_user_id", userIds),
      ]);

      // Compute task counts per user
      const tasksByUser: Record<string, { assigned: number; completed: number }> = {};
      for (const uid of userIds) {
        tasksByUser[uid] = { assigned: 0, completed: 0 };
      }
      for (const t of boardTasks.data ?? []) {
        if (!tasksByUser[t.owner_user_id]) {
          tasksByUser[t.owner_user_id] = { assigned: 0, completed: 0 };
        }
        tasksByUser[t.owner_user_id].assigned++;
        if (t.status === "done") {
          tasksByUser[t.owner_user_id].completed++;
        }
      }

      return {
        kpiEntries: new Set(kpiEntries.data?.map((k) => k.user_id) ?? []),
        slides: new Set(slides.data?.map((s) => s.user_id) ?? []),
        tasksByUser,
      };
    },
  });

  // Fetch existing brief
  const briefQuery = useQuery({
    queryKey: ["meeting-brief", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_briefs")
        .select("*, approved_by:users!meeting_briefs_approved_by_user_id_fkey(full_name)")
        .eq("meeting_id", meetingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Generate brief mutation
  const generateBrief = useMutation({
    mutationFn: async () => {
      const dirs = dirigenti.data ?? [];
      const dirIds = dirs.map((d) => d.id);

      // Gather completion status per user
      const [hlRes, kpiRes, cmRes, slRes, tasksRes, kpiEntriesRes] = await Promise.all([
        dirIds.length ? supabase.from("highlights").select("user_id, title").eq("meeting_id", meetingId).in("user_id", dirIds) : { data: [] },
        dirIds.length ? supabase.from("kpi_entries").select("user_id, kpi_id, current_value, previous_value, delta, delta_percent, is_improved").eq("meeting_id", meetingId).in("user_id", dirIds) : { data: [] },
        dirIds.length ? supabase.from("commitments").select("user_id").eq("meeting_id", meetingId).in("user_id", dirIds) : { data: [] },
        dirIds.length ? supabase.from("slide_uploads").select("user_id").eq("meeting_id", meetingId).in("user_id", dirIds) : { data: [] },
        supabase.from("board_tasks").select("id", { count: "exact" }).eq("tenant_id", tenantId).neq("status", "done"),
        dirIds.length ? supabase.from("kpi_entries").select("kpi_id, delta, delta_percent, is_improved, user_id").eq("meeting_id", meetingId).eq("tenant_id", tenantId).order("delta", { ascending: false }) : { data: [] },
      ]);

      const hlSet = new Set((hlRes.data ?? []).map((h) => h.user_id));
      const kpiSet = new Set((kpiRes.data ?? []).map((k) => k.user_id));
      const cmSet = new Set((cmRes.data ?? []).map((c) => c.user_id));
      const slSet = new Set((slRes.data ?? []).map((s) => s.user_id));

      const completionStatus: Record<string, { name: string; highlights: boolean; kpi: boolean; commitments: boolean; slides: boolean }> = {};
      for (const d of dirs) {
        completionStatus[d.id] = {
          name: d.full_name,
          highlights: hlSet.has(d.id),
          kpi: kpiSet.has(d.id),
          commitments: cmSet.has(d.id),
          slides: slSet.has(d.id),
        };
      }

      const completedUsers = dirs.filter((d) => hlSet.has(d.id) && kpiSet.has(d.id)).length;

      // KPI summary: top 5 increases and decreases
      const kpiEntries = kpiEntriesRes.data ?? [];
      // Fetch KPI names
      const kpiIds = [...new Set(kpiEntries.map((e) => e.kpi_id))];
      let kpiNameMap = new Map<string, string>();
      if (kpiIds.length) {
        const { data: kpiDefs } = await supabase.from("kpi_definitions").select("id, name").in("id", kpiIds);
        for (const k of kpiDefs ?? []) kpiNameMap.set(k.id, k.name);
      }
      let userNameMap = new Map<string, string>();
      for (const d of dirs) userNameMap.set(d.id, d.full_name);

      const increases = kpiEntries
        .filter((e) => e.is_improved === true && e.delta !== null)
        .sort((a, b) => Math.abs(Number(b.delta ?? 0)) - Math.abs(Number(a.delta ?? 0)))
        .slice(0, 5)
        .map((e) => ({ kpi: kpiNameMap.get(e.kpi_id) ?? e.kpi_id, user: userNameMap.get(e.user_id) ?? "", delta: e.delta, delta_percent: e.delta_percent }));

      const decreases = kpiEntries
        .filter((e) => e.is_improved === false && e.delta !== null)
        .sort((a, b) => Math.abs(Number(b.delta ?? 0)) - Math.abs(Number(a.delta ?? 0)))
        .slice(0, 5)
        .map((e) => ({ kpi: kpiNameMap.get(e.kpi_id) ?? e.kpi_id, user: userNameMap.get(e.user_id) ?? "", delta: e.delta, delta_percent: e.delta_percent }));

      const highlightsTitles = (hlRes.data ?? []).map((h) => h.title);
      const highlightsSummary = highlightsTitles.join(" • ");

      const briefPayload = {
        meeting_id: meetingId,
        tenant_id: tenantId,
        completion_status: completionStatus as unknown as Json,
        total_users: dirs.length,
        completed_users: completedUsers,
        kpi_summary: { increases, decreases } as unknown as Json,
        highlights_summary: highlightsSummary || null,
        open_tasks_count: tasksRes.count ?? 0,
        status: "pending_approval",
        generated_at: new Date().toISOString(),
      };

      // Upsert
      const existing = briefQuery.data;
      if (existing) {
        const { error } = await supabase
          .from("meeting_briefs")
          .update(briefPayload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("meeting_briefs")
          .insert(briefPayload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-brief", meetingId] });
      toast({ title: "Brief generato e in attesa di approvazione." });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const sendBrief = useMutation({
    mutationFn: async () => {
      // Placeholder: just mark as sent via a toast
    },
    onSuccess: () => {
      toast({ title: "Brief inviato con successo!" });
    },
  });

  const CheckIcon = ({ done }: { done: boolean }) =>
    done ? (
      <Check className="h-4 w-4 mx-auto" style={{ color: "hsl(var(--status-done))" }} />
    ) : (
      <X className="h-4 w-4 mx-auto" style={{ color: "hsl(var(--status-stuck))" }} />
    );

  const brief = briefQuery.data;
  const briefStatus = brief?.status;

  const BriefStatusSection = () => {
    if (briefQuery.isLoading) return <Skeleton className="h-12 w-full" />;

    if (!brief) {
      return isAdmin && (meeting.status === "pre_meeting" || meeting.status === "in_progress") ? (
        <Card className="border border-border">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Meeting Brief</p>
              <p className="text-xs text-muted-foreground">Brief non generato</p>
            </div>
            <Button onClick={() => generateBrief.mutate()} disabled={generateBrief.isPending} size="sm">
              {generateBrief.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
              Genera Brief
            </Button>
          </CardContent>
        </Card>
      ) : null;
    }

    return (
      <Card className="border border-border">
        <CardContent className="p-6 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Meeting Brief</p>
              {briefStatus === "pending_approval" && (
                <Badge variant="secondary" className="inline-flex items-center text-[10px] gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-waiting))]" />
                  In attesa di approvazione IO
                </Badge>
              )}
              {briefStatus === "approved" && (
                <Badge variant="secondary" className="inline-flex items-center text-[10px] gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-done))]" />
                  Approvato{brief.approved_by && typeof brief.approved_by === "object" && "full_name" in brief.approved_by ? ` da ${(brief.approved_by as any).full_name}` : ""}
                </Badge>
              )}
              {briefStatus === "rejected" && (
                <Badge variant="destructive" className="inline-flex items-center text-[10px]">
                  Rifiutato
                </Badge>
              )}
            </div>
            {briefStatus === "rejected" && brief.rejection_note && (
              <p className="text-xs text-destructive">{brief.rejection_note}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/meetings/${meetingId}/brief`)}>
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Vedi Brief
            </Button>
            {isAdmin && (briefStatus === "rejected" || briefStatus === "pending_approval") && (
              <Button variant="outline" size="sm" onClick={() => generateBrief.mutate()} disabled={generateBrief.isPending}>
                {generateBrief.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Rigenera
              </Button>
            )}
            {isAdmin && briefStatus === "approved" && (
              <Button size="sm" onClick={() => sendBrief.mutate()} disabled={sendBrief.isPending}>
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Invia Brief
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };


  return (
    <div className="space-y-6">
      {/* Info card */}
      <Card className="border border-border">
        <CardContent className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Data</p>
              <p className="font-medium text-foreground">
                {new Date(meeting.scheduled_date).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Trimestre</p>
              <p className="font-medium font-mono text-foreground">{meeting.quarter}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Apertura Upload</p>
              <p className="font-medium text-foreground">
                {new Date(meeting.pre_meeting_deadline).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Stato</p>
              <p className="font-medium text-foreground capitalize">
                {meeting.status.replace("_", " ")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brief status */}
      <BriefStatusSection />

      {/* Completion matrix */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Completamento Pre-Meeting
        </h2>

        {dirigenti.isLoading || completionData.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !dirigenti.data?.length ? (
          <p className="text-sm text-muted-foreground">Nessun dirigente nel team.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Dirigente</TableHead>
                  <TableHead className="text-center w-24">KPI</TableHead>
                  <TableHead className="text-center w-24">Allegati</TableHead>
                  <TableHead className="text-center w-32">Task Assegnati</TableHead>
                  <TableHead className="text-center w-32">Task Completati</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dirigenti.data.map((d) => {
                  const cd = completionData.data;
                  const taskInfo = cd?.tasksByUser?.[d.id] ?? { assigned: 0, completed: 0 };
                  return (
                    <TableRow key={d.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{d.full_name}</p>
                          {d.job_title && (
                            <p className="text-xs text-muted-foreground">{d.job_title}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckIcon done={cd?.kpiEntries instanceof Set && cd.kpiEntries.has(d.id)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckIcon done={cd?.slides instanceof Set && cd.slides.has(d.id)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium text-foreground">{taskInfo.assigned}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm font-medium text-foreground">{taskInfo.completed}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
