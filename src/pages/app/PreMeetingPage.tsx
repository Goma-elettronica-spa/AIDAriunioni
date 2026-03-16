import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

import { PreviousCommitmentsSection } from "@/components/pre-meeting/PreviousCommitmentsSection";
import { KpiSection } from "@/components/pre-meeting/KpiSection";
import { HighlightsSection } from "@/components/pre-meeting/HighlightsSection";
import { CommitmentsSection } from "@/components/pre-meeting/CommitmentsSection";
import { TasksSection } from "@/components/pre-meeting/TasksSection";
import { SlideUploadSection } from "@/components/pre-meeting/SlideUploadSection";

export default function PreMeetingPage() {
  const { id: meetingId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch meeting
  const meeting = useQuery({
    queryKey: ["pre-meeting", meetingId],
    enabled: !!meetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title, status, scheduled_date, pre_meeting_deadline, tenant_id, quarter")
        .eq("id", meetingId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Find previous meeting
  const previousMeeting = useQuery({
    queryKey: ["prev-meeting", meeting.data?.tenant_id, meeting.data?.scheduled_date],
    enabled: !!meeting.data,
    queryFn: async () => {
      const { data } = await supabase
        .from("meetings")
        .select("id")
        .eq("tenant_id", meeting.data!.tenant_id)
        .lt("scheduled_date", meeting.data!.scheduled_date)
        .order("scheduled_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const isReadOnly =
    submitted ||
    meeting.data?.status !== "pre_meeting" ||
    new Date(meeting.data?.pre_meeting_deadline ?? "") < new Date();

  const showSaved = useCallback(() => {
    setSaveStatus("saved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
  }, []);

  const onAutoSave = useCallback(() => {
    setSaveStatus("saving");
    // Each section handles its own save, then calls showSaved
  }, []);

  // Section completion tracking
  const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());
  const markComplete = useCallback((section: number, complete: boolean) => {
    setCompletedSections((prev) => {
      const next = new Set(prev);
      if (complete) next.add(section);
      else next.delete(section);
      return next;
    });
  }, []);

  if (meeting.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meeting.data || meeting.data.status !== "pre_meeting") {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground mb-4">
          {meeting.data ? "Il pre-meeting non è attivo per questa riunione." : "Riunione non trovata."}
        </p>
        <Button variant="outline" onClick={() => navigate("/meetings")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alle Riunioni
        </Button>
      </div>
    );
  }

  const sections = [
    "Impegni Precedenti",
    "I tuoi KPI",
    "Highlight del Mese",
    "Impegni Mese Prossimo",
    "Impegni Trimestre",
    "Task",
    "Upload Slide",
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground"
          onClick={() => navigate("/meetings")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Riunioni
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{meeting.data.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pre-Meeting · Deadline:{" "}
              {new Date(meeting.data.pre_meeting_deadline).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-xs flex items-center gap-1" style={{ color: "hsl(var(--status-done))" }}>
                <Check className="h-3 w-3" /> Salvato
              </span>
            )}
          </div>
        </div>

        {isReadOnly && (
          <Badge variant="secondary" className="mt-2 text-xs">
            Sola lettura
          </Badge>
        )}
      </div>

      {/* Progress */}
      <div className="flex gap-2 flex-wrap">
        {sections.map((s, i) => (
          <Badge
            key={i}
            variant={completedSections.has(i) ? "default" : "outline"}
            className="text-xs gap-1"
          >
            {completedSections.has(i) && <Check className="h-3 w-3" />}
            {i}. {s}
          </Badge>
        ))}
      </div>

      {/* Section 0 */}
      <PreviousCommitmentsSection
        meetingId={meetingId!}
        previousMeetingId={previousMeeting.data?.id ?? null}
        userId={user!.id}
        tenantId={meeting.data.tenant_id}
        readOnly={isReadOnly}
        onSaved={showSaved}
        onComplete={(c) => markComplete(0, c)}
      />

      {/* Section 1 */}
      <KpiSection
        meetingId={meetingId!}
        previousMeetingId={previousMeeting.data?.id ?? null}
        userId={user!.id}
        tenantId={meeting.data.tenant_id}
        readOnly={isReadOnly}
        onSaved={showSaved}
        onComplete={(c) => markComplete(1, c)}
      />

      {/* Section 2 */}
      <HighlightsSection
        meetingId={meetingId!}
        userId={user!.id}
        tenantId={meeting.data.tenant_id}
        readOnly={isReadOnly}
        onSaved={showSaved}
        onComplete={(c) => markComplete(2, c)}
      />

      {/* Section 3 */}
      <CommitmentsSection
        meetingId={meetingId!}
        userId={user!.id}
        tenantId={meeting.data.tenant_id}
        type="monthly"
        title="3. Impegni Mese Prossimo"
        readOnly={isReadOnly}
        onSaved={showSaved}
        onComplete={(c) => markComplete(3, c)}
      />

      {/* Section 4 */}
      <CommitmentsSection
        meetingId={meetingId!}
        userId={user!.id}
        tenantId={meeting.data.tenant_id}
        type="quarterly"
        title={`4. Impegni Trimestre (${meeting.data.quarter})`}
        readOnly={isReadOnly}
        onSaved={showSaved}
        onComplete={(c) => markComplete(4, c)}
      />

      {/* Section 5 */}
      <TasksSection
        meetingId={meetingId!}
        userId={user!.id}
        tenantId={meeting.data.tenant_id}
        readOnly={isReadOnly}
        onSaved={showSaved}
        onComplete={(c) => markComplete(5, c)}
      />

      {/* Section 6 */}
      <SlideUploadSection
        meetingId={meetingId!}
        userId={user!.id}
        tenantId={meeting.data.tenant_id}
        readOnly={isReadOnly}
        onSaved={showSaved}
        onComplete={(c) => markComplete(6, c)}
      />

      {/* Submit */}
      {!isReadOnly && (
        <div className="border-t border-border pt-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" className="w-full sm:w-auto">
                Conferma e Invia
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confermi l'invio?</AlertDialogTitle>
                <AlertDialogDescription>
                  Una volta confermato, i dati del pre-meeting diventeranno di sola lettura.
                  I dati sono già salvati automaticamente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={() => {
                  setSubmitted(true);
                  toast({ title: "Pre-meeting inviato con successo" });
                }}>
                  Conferma
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
