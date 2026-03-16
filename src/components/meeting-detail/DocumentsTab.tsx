import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, Sparkles } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
  isAdmin: boolean;
}

export function DocumentsTab({ meeting, isAdmin }: Props) {
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

  if (brief.isLoading) return <Skeleton className="h-28 w-full" />;

  return (
    <div className="space-y-6">
      {/* Brief status */}
      {brief.data && (
        <Card className="border border-border">
          <CardContent className="p-card-padding">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Meeting Brief</p>
                <Badge variant="secondary" className="text-xs mt-1">
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

      {/* Generated documents */}
      {docs.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground mb-2">Documenti Generati</h3>
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
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Nessun documento generato</p>
          {isAdmin && (
            <Button onClick={() => alert("Generazione documenti — funzionalità futura")}>
              <Sparkles className="h-4 w-4 mr-2" />
              Genera Documenti
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
