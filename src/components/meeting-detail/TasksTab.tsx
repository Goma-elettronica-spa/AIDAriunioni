import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  Sparkles,
  FileText,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";

interface Props {
  meetingId: string;
  tenantId: string;
  isAdmin: boolean;
  transcriptUrl: string | null;
  summaryText?: string | null;
}

interface SuggestedTask {
  id: string;
  title: string;
  description: string | null;
  suggested_role: string;
  status: string;
  assigned_user_id: string | null;
  meeting_id: string;
  tenant_id: string;
  created_at: string;
}

interface TenantUser {
  id: string;
  full_name: string;
  job_title: string | null;
}

interface EditState {
  title: string;
  description: string;
  assigned_user_id: string;
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

export function TasksTab({ meetingId, tenantId, isAdmin, transcriptUrl, summaryText }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [edits, setEdits] = useState<Record<string, EditState>>({});

  // Fetch tenant users for assignment dropdown
  const tenantUsers = useQuery({
    queryKey: ["tenant-users", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, job_title")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as TenantUser[];
    },
  });

  // Fetch suggested tasks
  const suggestedTasks = useQuery({
    queryKey: ["suggested-tasks", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suggested_tasks")
        .select("*")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as SuggestedTask[];
    },
  });

  // Fetch board tasks for this meeting
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
      let ownersData: { id: string; full_name: string }[] = [];
      if (ownerIds.length) {
        const { data: oData } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", ownerIds);
        ownersData = oData ?? [];
      }
      const ownerMap = new Map<string, string>();
      for (const o of ownersData) ownerMap.set(o.id, o.full_name);

      return data.map((t) => ({
        ...t,
        owner_name: ownerMap.get(t.owner_user_id) ?? "\u2014",
      }));
    },
  });

  // Initialize edit state when suggested tasks load
  useEffect(() => {
    if (suggestedTasks.data) {
      const newEdits: Record<string, EditState> = {};
      for (const st of suggestedTasks.data) {
        if (st.status === "suggested") {
          // Auto-match user by job_title
          let matchedUserId = st.assigned_user_id ?? "";
          if (!matchedUserId && tenantUsers.data) {
            const match = tenantUsers.data.find(
              (u) =>
                u.job_title &&
                st.suggested_role &&
                u.job_title.toLowerCase().includes(st.suggested_role.toLowerCase()),
            );
            if (match) matchedUserId = match.id;
          }
          newEdits[st.id] = {
            title: st.title,
            description: st.description ?? "",
            assigned_user_id: matchedUserId,
          };
        }
      }
      setEdits((prev) => ({ ...prev, ...newEdits }));
    }
  }, [suggestedTasks.data, tenantUsers.data]);

  const generateSuggestedTasks = async () => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || "";
    if (!apiKey) {
      toast({
        title: "Configura la chiave API Anthropic nelle variabili d'ambiente (VITE_ANTHROPIC_API_KEY)",
        variant: "destructive",
      });
      return;
    }

    // Gather the text to analyze: prefer transcript, fall back to summary_text
    let transcriptText = "";

    if (transcriptUrl) {
      const ext = transcriptUrl.toLowerCase();
      if (ext.endsWith(".txt") || ext.endsWith(".md")) {
        try {
          const r = await fetch(transcriptUrl);
          transcriptText = await r.text();
        } catch {
          // fall through to summary_text
        }
      }
    }

    if (!transcriptText && summaryText) {
      transcriptText = summaryText;
    }

    if (!transcriptText) {
      toast({
        title: "Nessuna trascrizione o riassunto disponibile per l'analisi",
        variant: "destructive",
      });
      return;
    }

    const users = tenantUsers.data ?? [];

    setGenerating(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          messages: [
            {
              role: "user",
              content: `Analizza questa trascrizione di una riunione dirigenziale e suggerisci 3-7 task operativi concreti.

Per ogni task indica:
- title: titolo breve e specifico del task
- description: descrizione di cosa fare (1-2 frasi)
- suggested_role: il ruolo aziendale piu' adatto (es. "Direttore Commerciale", "CFO", "CTO", "HR Manager")

I ruoli disponibili nell'organizzazione sono:
${users.map((u) => `- ${u.full_name}: ${u.job_title || "Nessun ruolo"}`).join("\n")}

Rispondi SOLO con un array JSON valido, senza altro testo. Esempio:
[{"title":"...","description":"...","suggested_role":"..."}]

TRASCRIZIONE:
${transcriptText}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.error?.message || `Errore API Anthropic: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      const content = data.content[0].text;
      const suggestedTasksFromAI = JSON.parse(content) as Array<{
        title: string;
        description: string;
        suggested_role: string;
      }>;

      const inserts = suggestedTasksFromAI.map((t) => ({
        meeting_id: meetingId,
        tenant_id: tenantId,
        title: t.title,
        description: t.description,
        suggested_role: t.suggested_role,
        status: "suggested",
      }));

      const { error } = await supabase.from("suggested_tasks").insert(inserts);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["suggested-tasks", meetingId] });
      for (const t of suggestedTasksFromAI) {
        writeAuditLog({
          tenantId,
          userId: user!.id,
          action: "create",
          entityType: "suggested_task",
          entityId: meetingId,
          newValues: { title: t.title, suggested_role: t.suggested_role },
        });
      }
      toast({ title: "Task suggeriti generati" });
    } catch (err: any) {
      toast({ title: "Errore generazione", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const confirmTask = async (st: SuggestedTask) => {
    const edit = edits[st.id];
    if (!edit?.assigned_user_id) {
      toast({ title: "Seleziona un utente a cui assegnare il task", variant: "destructive" });
      return;
    }
    try {
      // Create board_task
      const { error: insertError } = await supabase.from("board_tasks").insert({
        meeting_id: meetingId,
        tenant_id: tenantId,
        title: edit.title,
        description: edit.description || null,
        owner_user_id: edit.assigned_user_id,
        created_by_user_id: user!.id,
        source: "ai_suggested",
        suggested_task_id: st.id,
        status: "todo",
        deadline_type: "next_meeting",
        deadline_date: new Date().toISOString().slice(0, 10),
        position: 0,
      });
      if (insertError) throw insertError;

      // Update suggested_task status
      const { error: updateError } = await supabase
        .from("suggested_tasks")
        .update({ status: "accepted", assigned_user_id: edit.assigned_user_id })
        .eq("id", st.id);
      if (updateError) throw updateError;

      // Send notification to the assigned user
      if (edit.assigned_user_id !== user!.id) {
        await (supabase.from as any)("notifications").insert({
          tenant_id: tenantId,
          user_id: edit.assigned_user_id,
          type: "task_assigned",
          title: "Nuovo task assegnato",
          body: `Ti e' stato assegnato: "${edit.title}"`,
          link: "/board",
          created_by: user!.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["suggested-tasks", meetingId] });
      queryClient.invalidateQueries({ queryKey: ["detail-tasks", meetingId] });
      writeAuditLog({
        tenantId,
        userId: user!.id,
        action: "update",
        entityType: "suggested_task",
        entityId: st.id,
        oldValues: { status: "suggested" },
        newValues: { status: "accepted", assigned_to: edit.assigned_user_id },
      });
      toast({ title: "Task confermato e creato" });
    } catch (err: any) {
      toast({ title: "Errore conferma task", description: err.message, variant: "destructive" });
    }
  };

  const rejectTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("suggested_tasks")
        .update({ status: "rejected" })
        .eq("id", taskId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["suggested-tasks", meetingId] });
      writeAuditLog({
        tenantId,
        userId: user!.id,
        action: "update",
        entityType: "suggested_task",
        entityId: taskId,
        oldValues: { status: "suggested" },
        newValues: { status: "rejected" },
      });
      toast({ title: "Task rifiutato" });
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    }
  };

  const updateEdit = (taskId: string, field: keyof EditState, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [taskId]: { ...prev[taskId], [field]: value },
    }));
  };

  const suggestedList = suggestedTasks.data ?? [];
  const activeSuggested = suggestedList.filter((st) => st.status === "suggested");
  const acceptedSuggested = suggestedList.filter((st) => st.status === "accepted");
  const rejectedSuggested = suggestedList.filter((st) => st.status === "rejected");

  const isLoading = tasks.isLoading || suggestedTasks.isLoading;

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-8">
      {/* AI Suggest button */}
      {isAdmin && (transcriptUrl || summaryText) && (
        <div className="flex items-center gap-3">
          <Button
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={generateSuggestedTasks}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analisi trascrizione in corso...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Suggerisci Task dall'AI
              </>
            )}
          </Button>
        </div>
      )}

      {/* Suggested tasks — editable */}
      {activeSuggested.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Task Suggeriti dall'AI</h3>
          <div className="space-y-3">
            {activeSuggested.map((st) => {
              const edit = edits[st.id] ?? {
                title: st.title,
                description: st.description ?? "",
                assigned_user_id: "",
              };
              return (
                <Card key={st.id} className="border border-border">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="inline-flex items-center text-[10px]">
                        <Sparkles className="h-2.5 w-2.5 mr-1" />
                        AI Suggerito
                      </Badge>
                      <Badge variant="secondary" className="inline-flex items-center text-[10px]">
                        {st.suggested_role}
                      </Badge>
                    </div>

                    <Input
                      value={edit.title}
                      onChange={(e) => updateEdit(st.id, "title", e.target.value)}
                      placeholder="Titolo task"
                      className="text-sm font-medium"
                    />

                    <Textarea
                      value={edit.description}
                      onChange={(e) => updateEdit(st.id, "description", e.target.value)}
                      placeholder="Descrizione"
                      rows={2}
                      className="text-sm"
                    />

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Assegna a
                      </label>
                      <Select
                        value={edit.assigned_user_id}
                        onValueChange={(val) => updateEdit(st.id, "assigned_user_id", val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleziona utente" />
                        </SelectTrigger>
                        <SelectContent>
                          {(tenantUsers.data ?? []).map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name}
                              {u.job_title ? ` \u2014 ${u.job_title}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => confirmTask(st)}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Conferma
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => rejectTask(st.id)}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Elimina
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Accepted suggested tasks */}
      {acceptedSuggested.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3">Task Confermati dall'AI</h3>
          <div className="space-y-2">
            {acceptedSuggested.map((st) => (
              <Card key={st.id} className="border border-border bg-muted/10">
                <CardContent className="flex items-center justify-between p-6">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{st.title}</p>
                    {st.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{st.description}</p>
                    )}
                  </div>
                  <Badge className="inline-flex items-center bg-green-100 text-green-800 text-[10px] ml-3 shrink-0">
                    <Check className="h-2.5 w-2.5 mr-1" />
                    Confermato
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Toggle rejected */}
      {rejectedSuggested.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground text-xs"
            onClick={() => setShowRejected(!showRejected)}
          >
            {showRejected ? (
              <EyeOff className="h-3 w-3 mr-1" />
            ) : (
              <Eye className="h-3 w-3 mr-1" />
            )}
            {showRejected ? "Nascondi rifiutati" : `Mostra rifiutati (${rejectedSuggested.length})`}
          </Button>

          {showRejected && (
            <div className="space-y-2 mt-2">
              {rejectedSuggested.map((st) => (
                <Card key={st.id} className="border border-border opacity-50">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground line-through">{st.title}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className="inline-flex items-center text-[10px] ml-3 shrink-0"
                    >
                      Rifiutato
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Existing board_tasks for this meeting */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Task della Riunione</h3>
        {tasks.data?.length ? (
          <div className="border border-border rounded-lg divide-y divide-border">
            {tasks.data.map((task) => {
              const sc = statusConfig[task.status] ?? statusConfig.todo;
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
                >
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
                    <Badge
                      variant="secondary"
                      className="inline-flex items-center text-[10px] gap-1"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${sc.dotClass}`} />
                      {sc.label}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="inline-flex items-center text-[10px] gap-1 hidden sm:flex"
                    >
                      <CalendarDays className="h-2.5 w-2.5" />
                      {deadlineLabels[task.deadline_type] ?? task.deadline_type}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessun task per questa riunione.
          </p>
        )}
      </div>
    </div>
  );
}
