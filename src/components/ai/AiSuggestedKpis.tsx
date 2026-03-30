import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SuggestedKpi {
  id: string;
  name: string;
  description: string;
  unit: string;
  direction: string;
  target_value: number | null;
  ai_rationale: string;
  suggestion_source: string;
}

export default function AiSuggestedKpis() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["ai-suggested-kpis", user?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("*")
        .eq("tenant_id", user!.tenant_id!)
        .eq("ai_suggested", true)
        .eq("is_active", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as SuggestedKpi[];
    },
    enabled: !!user?.tenant_id,
  });

  const acceptMutation = useMutation({
    mutationFn: async (kpiId: string) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_active: true } as any)
        .eq("id", kpiId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-suggested-kpis"] });
      toast.success("KPI accettata e attivata");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (kpiId: string) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .delete()
        .eq("id", kpiId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-suggested-kpis"] });
      toast.success("KPI scartata");
    },
  });

  if (isLoading || !suggestions?.length) return null;

  return (
    <Card className="border border-border border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          KPI suggerite dall'AI
          <Badge variant="secondary" className="ml-auto text-xs">
            {suggestions.length} nuove
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestions.map((kpi) => (
          <div key={kpi.id} className="p-3 rounded-lg border border-border space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{kpi.name}</p>
                <p className="text-xs text-muted-foreground">{kpi.description}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => acceptMutation.mutate(kpi.id)}
                  disabled={acceptMutation.isPending}
                >
                  {acceptMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => rejectMutation.mutate(kpi.id)}
                  disabled={rejectMutation.isPending}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {kpi.ai_rationale && (
              <p className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                <span className="font-medium">AI:</span> {kpi.ai_rationale}
              </p>
            )}
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">{kpi.unit}</Badge>
              <Badge variant="outline" className="text-xs">{kpi.direction === "up" ? "Obiettivo +" : "Obiettivo −"}</Badge>
              {kpi.target_value != null && (
                <Badge variant="outline" className="text-xs">Target: {kpi.target_value}</Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
