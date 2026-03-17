import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, Plus, ChevronRight, CalendarIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";

const statusConfig: Record<string, { label: string; dotClass: string; order: number }> = {
  draft: { label: "Bozza", dotClass: "bg-[hsl(var(--status-todo))]", order: 0 },
  pre_meeting: { label: "Prevista", dotClass: "bg-[hsl(var(--status-waiting))]", order: 1 },
  open: { label: "Aperta", dotClass: "bg-[hsl(var(--status-done))]", order: 2 },
  in_progress: { label: "In Corso", dotClass: "bg-[hsl(var(--status-wip))]", order: 3 },
  completed: { label: "Conclusa", dotClass: "bg-gray-700", order: 4 },
};

const statusFlow = ["draft", "pre_meeting", "open", "in_progress", "completed"];

function getQuarter(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `Q${q}-${date.getFullYear()}`;
}

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${className}`} />;
}

function getDisplayStatus(meeting: { status: string; scheduled_date: string; pre_meeting_deadline?: string | null }): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const scheduled = new Date(meeting.scheduled_date);
  scheduled.setHours(0, 0, 0, 0);

  // Data odierna > data riunione → Conclusa
  if (today > scheduled) {
    return "completed";
  }

  // Data odierna = data riunione → In Corso
  if (today.getTime() === scheduled.getTime()) {
    return "in_progress";
  }

  // Data odierna >= data apertura upload AND < data riunione → Aperta
  if (meeting.pre_meeting_deadline) {
    const opening = new Date(meeting.pre_meeting_deadline);
    opening.setHours(0, 0, 0, 0);
    if (today >= opening) {
      return "open";
    }
  }

  // Data odierna < data apertura → Prevista
  return "pre_meeting";
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;
  const isAdmin = user?.role === "org_admin";

  const [statusFilter, setStatusFilter] = useState("all");
  const [quarterFilter, setQuarterFilter] = useState("all");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [deadline, setDeadline] = useState<Date | undefined>();
  const currentYear = new Date().getFullYear();
  const [selectedQuarter, setSelectedQuarter] = useState(`Q1-${currentYear}`);

  // Meetings
  const meetings = useQuery({
    queryKey: ["meetings-list", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title, scheduled_date, status, quarter, pre_meeting_deadline")
        .eq("tenant_id", tenantId!)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Pre-meeting progress for all meetings (batch)
  const meetingIds = meetings.data?.map((m) => m.id) ?? [];
  const preMeetingProgress = useQuery({
    queryKey: ["meetings-progress", tenantId, meetingIds],
    enabled: !!tenantId && meetingIds.length > 0,
    queryFn: async () => {
      const [highlights, dirigentiCount] = await Promise.all([
        supabase
          .from("highlights")
          .select("meeting_id, user_id")
          .eq("tenant_id", tenantId!)
          .in("meeting_id", meetingIds),
        supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId!)
          .eq("role", "dirigente"),
      ]);

      const total = dirigentiCount.count ?? 0;
      const byMeeting = new Map<string, Set<string>>();
      for (const h of highlights.data ?? []) {
        if (!byMeeting.has(h.meeting_id)) byMeeting.set(h.meeting_id, new Set());
        byMeeting.get(h.meeting_id)!.add(h.user_id);
      }

      const result: Record<string, { completed: number; total: number }> = {};
      for (const id of meetingIds) {
        result[id] = { completed: byMeeting.get(id)?.size ?? 0, total };
      }
      return result;
    },
  });

  // Filters
  const quarters = useMemo(() => {
    if (!meetings.data) return [];
    return [...new Set(meetings.data.map((m) => m.quarter))].sort().reverse();
  }, [meetings.data]);

  const filtered = useMemo(() => {
    if (!meetings.data) return [];
    return meetings.data.filter((m) => {
      const displayStatus = getDisplayStatus(m);
      if (statusFilter !== "all" && displayStatus !== statusFilter) return false;
      if (quarterFilter !== "all" && m.quarter !== quarterFilter) return false;
      return true;
    });
  }, [meetings.data, statusFilter, quarterFilter]);

  // Create
  const openCreate = () => {
    const d = new Date();
    const monthName = format(d, "MMMM yyyy", { locale: it });
    setTitle(`Riunione Prima Linea - ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`);
    setScheduledDate(undefined);
    setDeadline(undefined);
    const q = Math.ceil((d.getMonth() + 1) / 3);
    setSelectedQuarter(`Q${q}-${d.getFullYear()}`);
    setCreateOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!scheduledDate) throw new Error("Data obbligatoria");
      const dl = deadline ?? new Date(scheduledDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      const { error } = await supabase.from("meetings").insert({
        title: title.trim(),
        scheduled_date: format(scheduledDate, "yyyy-MM-dd"),
        pre_meeting_deadline: dl.toISOString(),
        quarter: selectedQuarter,
        status: "draft",
        tenant_id: tenantId!,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings-list"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "create",
        entityType: "meeting",
        entityId: crypto.randomUUID(),
        newValues: { title: title.trim(), scheduled_date: scheduledDate ? format(scheduledDate, "yyyy-MM-dd") : null },
      });
      setCreateOpen(false);
      toast({ title: "Riunione creata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Status change
  const statusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("meetings")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["meetings-list"] });
      const meeting = meetings.data?.find((m) => m.id === variables.id);
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "meeting",
        entityId: variables.id,
        oldValues: { status: meeting?.status ?? null },
        newValues: { status: variables.newStatus },
      });
      toast({ title: "Stato aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Auto-set deadline when date changes
  const handleDateChange = (d: Date | undefined) => {
    setScheduledDate(d);
    if (d && !deadline) {
      setDeadline(new Date(d.getTime() - 3 * 24 * 60 * 60 * 1000));
    }
  };

  return (
    <div className="space-y-section-gap">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Riunioni</h1>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuova Riunione
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="draft">Bozza</SelectItem>
            <SelectItem value="pre_meeting">Pre-Meeting</SelectItem>
            <SelectItem value="in_progress">In Corso</SelectItem>
            <SelectItem value="completed">Conclusa</SelectItem>
          </SelectContent>
        </Select>

        {quarters.length > 0 && (
          <Select value={quarterFilter} onValueChange={setQuarterFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Trimestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              {quarters.map((q) => (
                <SelectItem key={q} value={q}>{q}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* List */}
      {meetings.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            {meetings.data?.length
              ? "Nessuna riunione corrisponde ai filtri"
              : "Nessuna riunione. Crea la prima!"}
          </p>
          {isAdmin && !meetings.data?.length && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Riunione
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const displayStatus = getDisplayStatus(m);
            const isPast = displayStatus === "completed" && m.status !== "completed";
            const sc = statusConfig[displayStatus] ?? statusConfig.draft;
            const progress = preMeetingProgress.data?.[m.id];
            const progressPercent =
              progress && progress.total > 0
                ? Math.round((progress.completed / progress.total) * 100)
                : 0;
            const nextStatusIdx = statusFlow.indexOf(m.status) + 1;
            const nextStatus =
              nextStatusIdx < statusFlow.length ? statusFlow[nextStatusIdx] : null;

            return (
              <Card
                key={m.id}
                className="border border-border hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => navigate(`/meetings/${m.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-foreground">
                          {m.title}
                        </h3>
                        <Badge
                          variant="secondary"
                          className={`inline-flex items-center text-xs font-normal gap-1.5 ${displayStatus === "completed" ? "bg-gray-100 text-gray-800" : ""}`}
                        >
                          <StatusDot className={sc.dotClass} />
                          {sc.label}
                        </Badge>
                        <Badge variant="outline" className="inline-flex items-center text-xs font-mono">
                          {m.quarter}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          {format(new Date(m.scheduled_date), "d MMMM yyyy", {
                            locale: it,
                          })}
                        </span>
                        {m.pre_meeting_deadline &&
                          !isPast && (
                            <span>
                              Apertura upload:{" "}
                              {format(
                                new Date(m.pre_meeting_deadline),
                                "d MMM",
                                { locale: it }
                              )}
                            </span>
                          )}
                      </div>

                      {/* Progress */}
                      {progress && progress.total > 0 && displayStatus !== "completed" && (
                        <div className="flex items-center gap-3 max-w-xs pt-1">
                          <Progress value={progressPercent} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {progress.completed}/{progress.total}
                          </span>
                        </div>
                      )}
                    </div>

                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuova Riunione</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="m-title">Titolo</Label>
              <Input
                id="m-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Data Riunione</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !scheduledDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {scheduledDate
                      ? format(scheduledDate, "PPP", { locale: it })
                      : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduledDate}
                    onSelect={handleDateChange}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Trimestre</Label>
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].flatMap((y) =>
                    [1, 2, 3, 4].map((q) => (
                      <SelectItem key={`Q${q}-${y}`} value={`Q${q}-${y}`}>
                        Q{q}-{y}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data Apertura Upload</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !deadline && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {deadline
                      ? format(deadline, "PPP", { locale: it })
                      : "Seleziona data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={setDeadline}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={
                  createMutation.isPending || !title.trim() || !scheduledDate
                }
              >
                {createMutation.isPending ? "Creazione..." : "Crea Riunione"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
