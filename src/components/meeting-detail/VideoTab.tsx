import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
  isAdmin: boolean;
}

export function VideoTab({ meeting, isAdmin }: Props) {
  const queryClient = useQueryClient();
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptLoaded, setTranscriptLoaded] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  // Load transcript text if URL exists
  if (meeting.transcript_url && !transcriptLoaded) {
    setTranscriptLoaded(true);
    fetch(meeting.transcript_url)
      .then((r) => r.text())
      .then(setTranscript)
      .catch(() => setTranscript("Errore nel caricamento della trascrizione."));
  }

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
    [meeting, queryClient]
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
    if (!file.name.endsWith(".txt")) {
      toast({ title: "Solo file .txt", variant: "destructive" });
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

  return (
    <div className="space-y-8">
      {/* Video */}
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

      {/* Transcript */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Trascrizione</h2>
        {meeting.transcript_url ? (
          <Card className="border border-border">
            <CardContent className="p-card-padding">
              <pre className="text-sm text-foreground whitespace-pre-wrap max-h-96 overflow-y-auto font-sans leading-relaxed">
                {transcript ?? "Caricamento…"}
              </pre>
            </CardContent>
          </Card>
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
                  Carica la trascrizione (.txt)
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
          accept=".txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleTranscriptUpload(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
