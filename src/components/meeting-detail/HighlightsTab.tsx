import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  meetingId: string;
  tenantId: string;
}

const trendIcon: Record<string, typeof TrendingUp> = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const trendColor: Record<string, string> = {
  up: "hsl(var(--status-done))",
  down: "hsl(var(--status-stuck))",
  stable: "hsl(var(--muted-foreground))",
};

export function HighlightsTab({ meetingId, tenantId }: Props) {
  const highlights = useQuery({
    queryKey: ["detail-highlights", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("highlights")
        .select("id, position, title, description, metric_name, metric_value, metric_trend, user_id")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId)
        .order("position");
      if (error) throw error;

      const userIds = [...new Set(data.map((h) => h.user_id))];
      const { data: users } = userIds.length
        ? await supabase.from("users").select("id, full_name, job_title").in("id", userIds)
        : { data: [] };
      const userMap = new Map(users?.map((u) => [u.id, u]) ?? []);

      // Group by user
      const grouped = new Map<string, { user: { full_name: string; job_title: string | null }; items: typeof data }>();
      for (const h of data) {
        if (!grouped.has(h.user_id)) {
          const u = userMap.get(h.user_id);
          grouped.set(h.user_id, {
            user: { full_name: u?.full_name ?? "—", job_title: u?.job_title ?? null },
            items: [],
          });
        }
        grouped.get(h.user_id)!.items.push(h);
      }
      return [...grouped.values()];
    },
  });

  if (highlights.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!highlights.data?.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nessun highlight per questa riunione.</p>;
  }

  return (
    <div className="space-y-8">
      {highlights.data.map((group, gi) => (
        <div key={gi}>
          <div className="mb-3">
            <h3 className="text-base font-semibold text-foreground">{group.user.full_name}</h3>
            {group.user.job_title && (
              <p className="text-xs text-muted-foreground">{group.user.job_title}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {group.items.map((h) => {
              const Icon = trendIcon[h.metric_trend ?? "stable"] ?? Minus;
              const color = trendColor[h.metric_trend ?? "stable"];
              return (
                <Card key={h.id} className="border border-border">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-sm font-medium text-foreground">{h.title}</p>
                    {h.description && (
                      <p className="text-xs text-muted-foreground">{h.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <p className="text-xs text-muted-foreground">{h.metric_name}</p>
                        <p className="text-lg font-semibold font-mono text-foreground">
                          {h.metric_value}
                        </p>
                      </div>
                      <Icon className="h-5 w-5" style={{ color }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
