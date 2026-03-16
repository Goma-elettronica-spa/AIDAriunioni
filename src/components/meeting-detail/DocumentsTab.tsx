import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Download, FileText, Sparkles, Loader2, Pencil, Save, Share2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
  isAdmin: boolean;
}

export function DocumentsTab({ meeting, isAdmin }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [editMode, setEditMode] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Extract summary_text from ai_raw_output JSON
  const aiRaw = meeting.ai_raw_output as Record<string, unknown> | null;
  const summaryText = (aiRaw?.summary_text as string) ?? null;

  const brief = useQuery({
    queryKey: ["detail-brief", meeting.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_briefs")
        .select("*")
        .eq("meeting_id", meeting.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const docs = [
    { label: "PDF Riepilogo", url: meeting.summary_pdf_url, icon: FileText },
    { label: "Word Riepilogo", url: meeting.summary_docx_url, icon: FileText },
    { label: "Presentazione", url: meeting.presentation_url, icon: FileText },
  ].filter((d) => d.url);

  const briefStatusConfig: Record<string, string> = {
    draft: "Bozza",
    generated: "Generato",
    approved: "Approvato",
    rejected: "Rifiutato",
  };

  const saveSummary = async (text: string) => {
    setSaving(true);
    try {
      const existingRaw = (meeting.ai_raw_output as Record<string, unknown>) ?? {};
      const newRaw = { ...existingRaw, summary_text: text };
      const { error } = await supabase
        .from("meetings")
        .update({ ai_raw_output: newRaw })
        .eq("id", meeting.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meeting.id] });
      toast({ title: "Riassunto salvato" });
      setEditMode(false);
    } catch (err: any) {
      toast({ title: "Errore salvataggio", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // TODO: Replace with Claude API call
  const generateSummary = async () => {
    setGenerating(true);
    try {
      const now = new Date().toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const placeholderSummary = `[Riassunto generato automaticamente - da implementare con Claude API]\n\nTrascrizione caricata il ${now}. Modifica questo testo per creare il riassunto operativo.`;

      const existingRaw = (meeting.ai_raw_output as Record<string, unknown>) ?? {};
      const newRaw = { ...existingRaw, summary_text: placeholderSummary };
      const { error } = await supabase
        .from("meetings")
        .update({ ai_raw_output: newRaw })
        .eq("id", meeting.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["meeting-detail", meeting.id] });
      toast({ title: "Riassunto generato" });
    } catch (err: any) {
      toast({ title: "Errore generazione", description: err.message, variant: "destructive" });
    }
    setGenerating(false);
  };

  const shareSummaryWithTeam = async () => {
    if (!user) return;
    setSharing(true);
    try {
      // Fetch active users in the tenant
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

      const { error: insertError } = await (supabase.from as any)("notifications").insert(notifications);
      if (insertError) throw insertError;

      toast({ title: `Riassunto condiviso con ${recipients.length} persone` });
    } catch (err: any) {
      toast({ title: "Errore condivisione", description: err.message, variant: "destructive" });
    }
    setSharing(false);
  };

  if (brief.isLoading) return <Skeleton className="h-28 w-full" />;

  return (
    <div className="space-y-6">
      {/* Brief status */}
      {brief.data && (
        <Card className="border border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Meeting Brief</p>
                <Badge variant="secondary" className="inline-flex items-center text-xs mt-1">
                  {briefStatusConfig[brief.data.status] ?? brief.data.status}
                </Badge>
              </div>
              {brief.data.brief_pdf_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={brief.data.brief_pdf_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Scarica Brief
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Riassunto Operativo */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Riassunto Operativo</h3>

        {summaryText ? (
          <Card className="border border-border">
            <CardContent className="p-6">
              {editMode ? (
                <div className="space-y-3">
                  <Textarea
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    rows={10}
                    className="min-h-[200px] text-sm leading-relaxed"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => saveSummary(summaryDraft)}
                      disabled={saving}
                    >
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Salva
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditMode(false)}
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
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
                          setEditMode(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />
                        Modifica
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
                </div>
              )}
            </CardContent>
          </Card>
        ) : meeting.transcript_url ? (
          isAdmin ? (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Genera un riassunto operativo dalla trascrizione
              </p>
              <Button
                className="bg-foreground text-background hover:bg-foreground/90"
                onClick={generateSummary}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generazione in corso...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Genera Riassunto con AI
                  </>
                )}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun riassunto disponibile.</p>
          )
        ) : (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Carica prima la trascrizione per generare il riassunto
            </p>
          </div>
        )}
      </div>

      {/* Documenti Esportabili */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Documenti Esportabili</h3>

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
            I documenti verranno generati dal riassunto operativo confermato
          </p>
        )}
      </div>
    </div>
  );
}
