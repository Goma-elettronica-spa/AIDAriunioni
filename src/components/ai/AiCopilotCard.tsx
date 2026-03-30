import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, TrendingUp, FileText, ListTodo, Lightbulb } from "lucide-react";
import { toast } from "sonner";

interface AiAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  type: string; // maps to ai_copilot.type
  roles: string[];
}

const AI_ACTIONS: AiAction[] = [
  {
    id: "talking_points",
    label: "Prepara i tuoi talking points",
    description: "L'AI analizza le tue KPI e suggerisce cosa presentare alla prossima riunione",
    icon: TrendingUp,
    type: "talking_points",
    roles: ["dirigente", "org_admin", "information_officer"],
  },
  {
    id: "kpi_prep",
    label: "Analizza varianze KPI",
    description: "Spiega automaticamente perché le KPI sono cambiate e suggerisce azioni correttive",
    icon: AlertTriangle,
    type: "kpi_prep",
    roles: ["dirigente", "org_admin"],
  },
  {
    id: "agenda",
    label: "Genera ordine del giorno",
    description: "Crea l'agenda basata su KPI critiche, task scaduti e impegni aperti",
    icon: ListTodo,
    type: "agenda",
    roles: ["org_admin", "information_officer"],
  },
  {
    id: "brief",
    label: "Genera brief pre-riunione",
    description: "Documento automatico con stato KPI, task, highlight e punti aperti",
    icon: FileText,
    type: "brief",
    roles: ["information_officer", "org_admin"],
  },
  {
    id: "improvements",
    label: "Suggerisci miglioramenti",
    description: "Proposte concrete basate sui trend delle tue KPI e i dati aziendali",
    icon: Lightbulb,
    type: "improvements",
    roles: ["dirigente", "org_admin"],
  },
];

interface CopilotResult {
  type: string;
  content: any;
  loading: boolean;
}

export default function AiCopilotCard({ meetingId }: { meetingId?: string }) {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<string, CopilotResult>>({});

  if (!user) return null;

  const availableActions = AI_ACTIONS.filter((a) => a.roles.includes(user.role));

  const handleAction = async (action: AiAction) => {
    setResults((prev) => ({
      ...prev,
      [action.id]: { type: action.type, content: null, loading: true },
    }));

    try {
      const { data, error } = await supabase.functions.invoke("ai-copilot", {
        body: {
          type: action.type,
          user_id: user.id,
          tenant_id: user.tenant_id,
          meeting_id: meetingId || null,
        },
      });

      if (error) throw error;

      setResults((prev) => ({
        ...prev,
        [action.id]: { type: action.type, content: data, loading: false },
      }));
    } catch (e: any) {
      toast.error("Errore AI: " + e.message);
      setResults((prev) => ({
        ...prev,
        [action.id]: { type: action.type, content: null, loading: false },
      }));
    }
  };

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="h-7 w-7 rounded-md bg-foreground text-background flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          AI Copilot
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {user.role === "org_admin" ? "Admin" : user.role === "information_officer" ? "Info Officer" : "Dirigente"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {availableActions.map((action) => {
          const result = results[action.id];
          const Icon = action.icon;

          return (
            <div key={action.id} className="space-y-2">
              <button
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                onClick={() => handleAction(action)}
                disabled={result?.loading}
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0 group-hover:bg-foreground group-hover:text-background transition-colors">
                    {result?.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                  </div>
                </div>
              </button>

              {/* Result display */}
              {result?.content && !result.loading && (
                <AiResultDisplay type={action.type} content={result.content} />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AiResultDisplay({ type, content }: { type: string; content: any }) {
  if (!content?.items?.length && !content?.text) {
    return (
      <div className="p-3 rounded-lg bg-muted/30 text-sm text-muted-foreground">
        Nessun suggerimento disponibile. Inserisci più dati per risultati migliori.
      </div>
    );
  }

  // Text-based results (brief, agenda)
  if (content.text) {
    return (
      <div className="p-4 rounded-lg bg-muted/30 text-sm space-y-2 whitespace-pre-line">
        {content.text}
      </div>
    );
  }

  // List-based results (talking points, kpi prep, improvements)
  return (
    <div className="p-3 rounded-lg bg-muted/30 space-y-2">
      {content.items.map((item: any, i: number) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{item.title}</p>
            {item.detail && (
              <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
