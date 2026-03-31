import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

export default function AiSuggestedKpis() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: count, isLoading } = useQuery({
    queryKey: ["ai-suggested-kpis-count", user?.tenant_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("kpi_definitions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", user!.tenant_id!)
        .eq("ai_suggested", true)
        .eq("is_active", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.tenant_id,
  });

  if (isLoading || !count) return null;

  return (
    <Card className="border border-border border-dashed bg-muted/20">
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {count} KPI suggerite dall'AI in attesa di revisione
            </p>
            <p className="text-xs text-muted-foreground">
              Rivedi, modifica e attiva le KPI per ogni area funzionale
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => navigate("/kpi/suggestions")}>
          Rivedi KPI
        </Button>
      </CardContent>
    </Card>
  );
}
