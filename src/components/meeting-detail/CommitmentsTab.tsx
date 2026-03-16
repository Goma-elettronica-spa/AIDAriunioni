import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  meetingId: string;
  tenantId: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "In sospeso", color: "hsl(var(--status-waiting))" },
  in_progress: { label: "In corso", color: "hsl(var(--status-wip))" },
  completed: { label: "Completato", color: "hsl(var(--status-done))" },
  missed: { label: "Mancato", color: "hsl(var(--status-stuck))" },
};

export function CommitmentsTab({ meetingId, tenantId }: Props) {
  const commitments = useQuery({
    queryKey: ["detail-commitments", meetingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitments")
        .select("id, description, type, status, user_id")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId);
      if (error) throw error;

      const userIds = [...new Set(data.map((c) => c.user_id))];
      let usersData: { id: string; full_name: string }[] = [];
      if (userIds.length) {
        const { data: uData } = await supabase.from("users").select("id, full_name").in("id", userIds);
        usersData = uData ?? [];
      }
      const userMap = new Map<string, string>();
      for (const u of usersData) userMap.set(u.id, u.full_name);

      const grouped = new Map<string, { name: string; items: typeof data }>();
      for (const c of data) {
        if (!grouped.has(c.user_id)) {
          grouped.set(c.user_id, { name: userMap.get(c.user_id) ?? "—", items: [] });
        }
        grouped.get(c.user_id)!.items.push(c);
      }
      return [...grouped.values()];
    },
  });

  if (commitments.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!commitments.data?.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nessun impegno per questa riunione.</p>;
  }

  return (
    <div className="space-y-6">
      {commitments.data.map((group, gi) => (
        <div key={gi}>
          <h3 className="text-base font-semibold text-foreground mb-3">{group.name}</h3>
          <div className="space-y-2">
            {group.items.map((c) => {
              const sc = statusConfig[c.status] ?? statusConfig.pending;
              return (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/20"
                >
                  <p className="text-sm text-foreground flex-1">{c.description}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                    <Badge
                      variant="secondary"
                      className="text-[10px] gap-1"
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: sc.color }}
                      />
                      {sc.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
