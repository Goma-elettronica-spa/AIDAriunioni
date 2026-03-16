import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  meetingId: string;
  previousMeetingId: string | null;
  userId: string;
  tenantId: string;
  readOnly: boolean;
  onSaved: () => void;
  onComplete: (complete: boolean) => void;
}

const statusOptions = [
  { value: "completed", label: "Completato", color: "hsl(var(--status-done))" },
  { value: "in_progress", label: "In corso", color: "hsl(var(--status-wip))" },
  { value: "missed", label: "Mancato", color: "hsl(var(--status-stuck))" },
];

export function PreviousCommitmentsSection({
  meetingId,
  previousMeetingId,
  userId,
  tenantId,
  readOnly,
  onSaved,
  onComplete,
}: Props) {
  const commitments = useQuery({
    queryKey: ["prev-commitments", previousMeetingId, userId],
    enabled: !!previousMeetingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitments")
        .select("id, description, status, type")
        .eq("meeting_id", previousMeetingId!)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .in("status", ["pending", "in_progress"]);
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("commitments")
        .update({ status, reviewed_at_meeting_id: meetingId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => onSaved(),
  });

  // Track completion
  useEffect(() => {
    if (!commitments.data) return;
    if (commitments.data.length === 0) {
      onComplete(true);
      return;
    }
    const allReviewed = commitments.data.every(
      (c) => c.status !== "pending"
    );
    onComplete(allReviewed);
  }, [commitments.data, onComplete]);

  if (!previousMeetingId) {
    return (
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">0. Verifica Impegni Precedenti</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Prima riunione — nessun impegno da verificare.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (commitments.isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!commitments.data?.length) {
    onComplete(true);
    return (
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-base">0. Verifica Impegni Precedenti</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nessun impegno in sospeso.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-base">0. Verifica Impegni del Mese Scorso</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {commitments.data.map((c) => (
          <div
            key={c.id}
            className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/30"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{c.description}</p>
              <Badge variant="outline" className="text-[10px] mt-1">{c.type}</Badge>
            </div>
            <Select
              value={c.status}
              onValueChange={(v) => updateMutation.mutate({ id: c.id, status: v })}
              disabled={readOnly}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
