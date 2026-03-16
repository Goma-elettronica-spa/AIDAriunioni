import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileText,
  Loader2,
  Download,
  Pencil,
  Save,
  Share2,
  ClipboardPaste,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
  isAdmin: boolean;
}

const ALLOWED_TRANSCRIPT_EXTENSIONS = [".txt", ".md", ".docx"];

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export function MaterialeTab({ meeting, isAdmin }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Video state
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Transcript state
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  // Summary state
  const [summaryMode, setSummaryMode] = useState<"view" | "edit" | "paste">("view");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [uploadingSummary, setUploadingSummary] = useState(false);
  const summaryFileInputRef = useRef<HTMLInputElement>(null);

  const summaryText = meeting.summary_text ?? null;

  const transcriptIsDocx = meeting.transcript_url
    ? meeting.transcript_url.toLowerCase().endsWith(".docx")
    : false;

  const transcriptIsText = meeting.transcript_url
    ? meeting.transcript_url.toLowerCase().endsWith(".txt") ||
      meeting.transcript_url.toLowerCase().endsWith(".md")
    : false;

  // Load transcript text if URL exists and is a text-based format
  useEffect(() => {
    if (meeting.transcript_url && transcriptIsText) {
      fetch(meeting.transcript_url)
        .then((r) => r.text())
        .then(setTranscript)
        .catch(() => setTranscript("Errore nel caricamento della trascrizione."));
    }
  }, [meeting.transcript_url, transcriptIsText]);

  const uploadFile = useCallback(
    async (file: File, bucket: string, field: "video_url" | "transcript_url") => {
      const path = `${meeting.tenant_id}/${meeting.id}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("meetings")
        .update({ [field]: urlData.publicUrl })
        .eq("id", meeting.id);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meeting.id] });
    },
    [meeting, queryClient],
  );

  const handleVideoUpload = async (file: File) => {
    const validTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Formato non supportato. Usa MP4, WebM o MOV.", variant: "destructive" });
      return;
    }
    setUploadingVideo(true);
    try {
      await uploadFile(file, "videos", "video_url");
      toast({ title: "Video caricato" });
    } catch (err: any) {
      toast({ title: "Errore upload video", description: err.message, variant: "destructive" });
    }
    setUploadingVideo(false);
  };

  const handleTranscriptUpload = async (file: File) => {
    const ext = getFileExtension(file.name);
    if (!ALLOWED_TRANSCRIPT_EXTENSIONS.includes(ext)) {
      toast({
        title: "Formato non supportato. Usa file .txt, .md o .docx",
        variant: "destructive",
      });
      return;
    }
    setUploadingTranscript(true);
    try {
      await uploadFile(file, "transcripts", "transcript_url");
      toast({ title: "Trascrizione caricata" });
    } catch (err: any) {
      toast({ title: "Errore upload", description: err.message, variant: "destructive" });
    }
    setUploadingTranscript(false);
  };

  // Summary helpers
  const saveSummary = async (text: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("meetings")
        .update({ summary_text: text })
        .eq("id", meeting.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meeting.id] });
      writeAuditLog({
        tenantId: meeting.tenant_id,
        userId: user!.id,
        action: "update",
        entityType: "meeting_summary",
        entityId: meeting.id,
        oldValues: { summary_text: summaryText ?? null },
        newValues: { summary_text: text },
      });
      toast({ title: "Riassunto salvato" });
      setSummaryMode("view");
    } catch (err: any) {
      toast({ title: "Errore salvataggio", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleSummaryFileUpload = async (file: File) => {
    const ext = getFileExtension(file.name);
    if (![".txt", ".md"].includes(ext)) {
      toast({ title: "Formato non supportato. Usa file .txt o .md", variant: "destructive" });
      return;
    }
    setUploadingSummary(true);
    try {
      const text = await file.text();
      await saveSummary(text);
    } catch (err: any) {
      toast({ title: "Errore lettura file", description: err.message, variant: "destructive" });
    }
    setUploadingSummary(false);
  };

  const shareSummaryWithTeam = async () => {
    if (!user) return;
    setSharing(true);
    try {
      const { data: teamUsers, error: usersError } = await supabase
        .from("users")
        .select("id")
        .eq("tenant_id", meeting.tenant_id)
        .eq("is_active", true);
      if (usersError) throw usersError;

      const recipients = (teamUsers ?? []).filter((u) => u.id !== user.id);
      if (recipients.length === 0) {
        toast({ title: "Nessun altro utente nel team" });
        setSharing(false);
        return;
      }

      const notifications = recipients.map((u) => ({
        tenant_id: meeting.tenant_id,
        user_id: u.id,
        type: "summary_shared",
        title: "Nuovo riassunto disponibile",
        body: `Il riassunto di "${meeting.title}" e' stato condiviso.`,
        link: `/meetings/${meeting.id}`,
        created_by: user.id,
      }));

      const { error: insertError } = await (supabase.from as any)("notifications").insert(
        notifications,
      );
      if (insertError) throw insertError;

      writeAuditLog({
        tenantId: meeting.tenant_id,
        userId: user!.id,
        action: "create",
        entityType: "summary_shared",
        entityId: meeting.id,
        newValues: { shared_with_count: recipients.length },
      });
      toast({ title: `Riassunto condiviso con ${recipients.length} persone` });
    } catch (err: any) {
      toast({ title: "Errore condivisione", description: err.message, variant: "destructive" });
    }
    setSharing(false);
  };

  const docs = [
    { label: "PDF Riepilogo", url: meeting.summary_pdf_url, icon: FileText },
    { label: "Word Riepilogo", url: meeting.summary_docx_url, icon: FileText },
    { label: "Presentazione", url: meeting.presentation_url, icon: FileText },
  ].filter((d) => d.url);

  return (
    <div className="space-y-8">
      {/* ── Section 1: Video ── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Video</h2>
        {meeting.video_url ? (
          <Card className="border border-border overflow-hidden">
            <AspectRatio ratio={16 / 9}>
              <video
                src={meeting.video_url}
                controls
                className="w-full h-full object-contain bg-foreground/5"
              />
            </AspectRatio>
          </Card>
        ) : isAdmin ? (
          <div
            className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:bg-muted/20 transition-colors"
            onClick={() => videoInputRef.current?.click()}
          >
            {uploadingVideo ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Carica il video della riunione (MP4, WebM, MOV)
                </p>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun video disponibile.</p>
        )}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleVideoUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* ── Section 2: Trascrizione ── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Trascrizione</h2>
        {meeting.transcript_url ? (
          transcriptIsDocx ? (
            <Card className="border border-border">
              <CardContent className="flex items-center justify-between p-6">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Trascrizione Word</span>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={meeting.transcript_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Scarica
                  </a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-border">
              <CardContent className="p-6">
                <pre className="text-sm text-foreground whitespace-pre-wrap max-h-96 overflow-y-auto font-sans leading-relaxed">
                  {transcript ?? "Caricamento\u2026"}
                </pre>
              </CardContent>
            </Card>
          )
        ) : isAdmin ? (
          <div
            className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:bg-muted/20 transition-colors"
            onClick={() => transcriptInputRef.current?.click()}
          >
            {uploadingTranscript ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            ) : (
              <>
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Carica la trascrizione (.txt, .md, .docx)
                </p>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessuna trascrizione disponibile.</p>
        )}
        <input
          ref={transcriptInputRef}
          type="file"
          accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleTranscriptUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* ── Section 3: Riassunto Operativo ── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Riassunto Operativo</h2>

        {summaryText && summaryMode === "view" ? (
          <Card className="border border-border">
            <CardContent className="p-6">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed mb-3">
                {summaryText}
              </pre>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSummaryDraft(summaryText);
                      setSummaryMode("edit");
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Modifica
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => summaryFileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Sostituisci
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={shareSummaryWithTeam}
                    disabled={sharing}
                  >
                    {sharing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5 mr-1.5" />
                        Condividi con il team
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : summaryMode === "edit" ? (
          <Card className="border border-border">
            <CardContent className="p-6 space-y-3">
              <Textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                rows={10}
                className="min-h-[200px] text-sm leading-relaxed"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => saveSummary(summaryDraft)} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Salva
                </Button>
                <Button variant="outline" size="sm" onClick={() => setSummaryMode("view")}>
                  Annulla
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : summaryMode === "paste" || (!summaryText && isAdmin) ? (
          <div className="space-y-4">
            {/* Option A: Upload file */}
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:bg-muted/20 transition-colors"
              onClick={() => summaryFileInputRef.current?.click()}
            >
              {uploadingSummary ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Carica un file di riassunto (.txt, .md)
                  </p>
                </>
              )}
            </div>

            {/* Option B: Paste text */}
            <Card className="border border-border">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardPaste className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Incolla testo</span>
                </div>
                <Textarea
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  placeholder="Incolla qui il riassunto..."
                  rows={8}
                  className="min-h-[160px] text-sm leading-relaxed"
                />
                <Button
                  size="sm"
                  onClick={() => saveSummary(summaryDraft)}
                  disabled={saving || !summaryDraft.trim()}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Salva
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun riassunto disponibile.</p>
        )}

        {/* Hidden file input for summary uploads */}
        <input
          ref={summaryFileInputRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleSummaryFileUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* ── Section 4: Documenti Scaricabili ── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Documenti Scaricabili</h2>
        {docs.length > 0 ? (
          <div className="space-y-2">
            {docs.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/20"
              >
                <div className="flex items-center gap-2">
                  <d.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{d.label}</span>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={d.url!} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Scarica
                  </a>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            I documenti saranno disponibili dopo la conferma del riassunto
          </p>
        )}
      </div>
    </div>
  );
}
