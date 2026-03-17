import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, FileSpreadsheet } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
}

export function PostMeetingTab({ meeting }: Props) {
  const docs = [
    { label: "Riassunto PDF", url: meeting.summary_pdf_url, icon: FileText },
    { label: "Riassunto Word", url: meeting.summary_docx_url, icon: FileText },
    { label: "Presentazione PPTX", url: meeting.presentation_url, icon: FileSpreadsheet },
  ].filter((d) => d.url);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Documenti Post-Riunione</h2>

        {docs.length > 0 ? (
          <div className="space-y-2">
            {docs.map((d, i) => (
              <Card key={i} className="border border-border">
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-3">
                    <d.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{d.label}</span>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={d.url!} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Scarica
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            I documenti saranno disponibili dopo il caricamento del riassunto operativo.
          </p>
        )}
      </div>

      {/* Show summary_text as formatted read-only text if it exists */}
      {meeting.summary_text && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">Riassunto Operativo</h2>
          <Card className="border border-border">
            <CardContent className="p-6">
              <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {meeting.summary_text}
              </pre>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
