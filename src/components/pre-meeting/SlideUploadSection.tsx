import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, FileText, Trash2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  meetingId: string;
  userId: string;
  tenantId: string;
  readOnly: boolean;
  onSaved: () => void;
  onComplete: (complete: boolean) => void;
}

export function SlideUploadSection({
  meetingId, userId, tenantId, readOnly, onSaved, onComplete,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const existing = useQuery({
    queryKey: ["slide-upload", meetingId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slide_uploads")
        .select("id, file_name, file_size, file_url")
        .eq("meeting_id", meetingId)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    onComplete(!!existing.data);
  }, [existing.data, onComplete]);

  const upload = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        toast({ title: "Solo file PDF", variant: "destructive" });
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "File troppo grande (max 50MB)", variant: "destructive" });
        return;
      }

      setUploading(true);
      const path = `${tenantId}/${meetingId}/${userId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("slides")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        toast({ title: "Errore upload", description: uploadError.message, variant: "destructive" });
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("slides").getPublicUrl(path);

      // Upsert slide_uploads record
      if (existing.data?.id) {
        await supabase
          .from("slide_uploads")
          .update({
            file_name: file.name,
            file_size: file.size,
            file_url: urlData.publicUrl,
          })
          .eq("id", existing.data.id);
      } else {
        await supabase.from("slide_uploads").insert({
          meeting_id: meetingId,
          user_id: userId,
          tenant_id: tenantId,
          file_name: file.name,
          file_size: file.size,
          file_url: urlData.publicUrl,
        });
      }

      existing.refetch();
      setUploading(false);
      onSaved();
      toast({ title: "Slide caricata" });
    },
    [meetingId, userId, tenantId, existing, onSaved]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  const handleDelete = async () => {
    if (!existing.data) return;
    const path = `${tenantId}/${meetingId}/${userId}.pdf`;
    await supabase.storage.from("slides").remove([path]);
    await supabase.from("slide_uploads").delete().eq("id", existing.data.id);
    existing.refetch();
    onSaved();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (existing.isLoading) return <Skeleton className="h-28 w-full" />;

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-base">6. Upload Slide</CardTitle>
      </CardHeader>
      <CardContent>
        {existing.data ? (
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {existing.data.file_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(existing.data.file_size)}
                </p>
              </div>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? "border-foreground bg-muted/40" : "border-border"
            } ${readOnly ? "opacity-50" : "cursor-pointer"}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!readOnly) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !readOnly && !uploading && inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Trascina un PDF oppure clicca per selezionare
                </p>
                <p className="text-xs text-muted-foreground mt-1">Max 50MB</p>
              </>
            )}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
