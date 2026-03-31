import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, X, Loader2, CheckCheck } from "lucide-react";
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
  functional_area_id: string | null;
  functional_areas?: { name: string } | null;
}

export default function AiSuggestedKpis() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["ai-suggested-kpis", user?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("*, functional_areas(name)")
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

  const acceptAllMutation = useMutation({
    mutationFn: async (kpiIds: string[]) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_active: true } as any)
        .in("id", kpiIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-suggested-kpis"] });
      toast.success("Tutte le KPI accettate e attivate");
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

  // Group by functional area
  const grouped = suggestions.reduce<Record<string, SuggestedKpi[]>>((acc, kpi) => {
    const areaName = kpi.functional_areas?.name || "Azienda";
    if (!acc[areaName]) acc[areaName] = [];
    acc[areaName].push(kpi);
    return acc;
  }, {});

  const allIds = suggestions.map((k) => k.id);

  return (
    <Card className="border border-border border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4" />
          KPI suggerite dall'AI
          <Badge variant="secondary" className="text-xs">
            {suggestions.length} nuove
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto text-xs h-7"
            onClick={() => acceptAllMutation.mutate(allIds)}
            disabled={acceptAllMutation.isPending}
          >
            {acceptAllMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
            )}
            Accetta tutte
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([areaName, kpis]) => (
          <div key={areaName}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {areaName}
            </p>
            <div className="space-y-2">
              {kpis.map((kpi) => (
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
                    <Badge variant="outline" className="text-xs">{kpi.direction === "up_is_good" ? "Obiettivo +" : "Obiettivo −"}</Badge>
                    {kpi.target_value != null && (
                      <Badge variant="outline" className="text-xs">Target: {kpi.target_value}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
