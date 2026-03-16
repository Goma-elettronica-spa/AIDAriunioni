import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  meetingId: string;
  userId: string;
  tenantId: string;
  readOnly: boolean;
  onSaved: () => void;
  onComplete: (complete: boolean) => void;
}

interface HighlightState {
  id: string | null;
  position: number;
  title: string;
  description: string;
  metric_name: string;
  metric_value: string;
  metric_trend: string | null;
}

const emptyHighlight = (pos: number): HighlightState => ({
  id: null,
  position: pos,
  title: "",
  description: "",
  metric_name: "",
  metric_value: "",
  metric_trend: null,
});

export function HighlightsSection({
  meetingId, userId, tenantId, readOnly, onSaved, onComplete,
}: Props) {
  const [highlights, setHighlights] = useState<HighlightState[]>([
    emptyHighlight(1),
    emptyHighlight(2),
    emptyHighlight(3),
  ]);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const existing = useQuery({
    queryKey: ["highlights", meetingId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("highlights")
        .select("id, position, title, description, metric_name, metric_value, metric_trend")
        .eq("meeting_id", meetingId)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!existing.data || loaded) return;
    const merged = [1, 2, 3].map((pos) => {
      const found = existing.data.find((h) => h.position === pos);
      return found
        ? {
            id: found.id,
            position: pos,
            title: found.title,
            description: found.description ?? "",
            metric_name: found.metric_name,
            metric_value: found.metric_value,
            metric_trend: found.metric_trend,
          }
        : emptyHighlight(pos);
    });
    setHighlights(merged);
    setLoaded(true);
  }, [existing.data, loaded]);

  const save = useCallback(
    async (h: HighlightState) => {
      if (!h.title.trim() || !h.metric_name.trim() || !h.metric_value.trim()) return;

      const payload = {
        meeting_id: meetingId,
        user_id: userId,
        tenant_id: tenantId,
        position: h.position,
        title: h.title.trim(),
        description: h.description.trim() || null,
        metric_name: h.metric_name.trim(),
        metric_value: h.metric_value.trim(),
        metric_trend: h.metric_trend,
      };

      if (h.id) {
        await supabase.from("highlights").update(payload).eq("id", h.id);
      } else {
        const { data } = await supabase
          .from("highlights")
          .insert(payload)
          .select("id")
          .single();
        if (data) {
          setHighlights((prev) =>
            prev.map((p) =>
              p.position === h.position ? { ...p, id: data.id } : p
            )
          );
        }
      }
      onSaved();
    },
    [meetingId, userId, tenantId, onSaved]
  );

  const debouncedSave = useCallback(
    (h: HighlightState) => {
      if (readOnly) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(h), 2000);
    },
    [save, readOnly]
  );

  const update = (position: number, updates: Partial<HighlightState>) => {
    setHighlights((prev) => {
      const next = prev.map((h) =>
        h.position === position ? { ...h, ...updates } : h
      );
      const updated = next.find((h) => h.position === position);
      if (updated) debouncedSave(updated);
      return next;
    });
  };

  useEffect(() => {
    const allFilled = highlights.every(
      (h) => h.title.trim() && h.metric_name.trim() && h.metric_value.trim()
    );
    onComplete(allFilled);
  }, [highlights, onComplete]);

  if (existing.isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-base">2. Highlight del Mese</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {highlights.map((h) => (
          <div key={h.position} className="space-y-3 p-4 rounded-lg bg-muted/20">
            <Label className="text-xs text-muted-foreground font-medium">
              Highlight {h.position}
            </Label>

            <Input
              placeholder="Titolo"
              value={h.title}
              onChange={(e) => update(h.position, { title: e.target.value })}
              disabled={readOnly}
            />

            <Textarea
              placeholder="Descrizione (opzionale)"
              value={h.description}
              onChange={(e) => update(h.position, { description: e.target.value })}
              disabled={readOnly}
              rows={2}
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nome Metrica</Label>
                <Input
                  placeholder="es. Fatturato, NPS"
                  value={h.metric_name}
                  onChange={(e) => update(h.position, { metric_name: e.target.value })}
                  disabled={readOnly}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Valore</Label>
                <Input
                  placeholder="es. €1.2M, 85%"
                  value={h.metric_value}
                  onChange={(e) => update(h.position, { metric_value: e.target.value })}
                  disabled={readOnly}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Trend</Label>
              <div className="flex gap-1 mt-1">
                {[
                  { value: "up", icon: TrendingUp, label: "In crescita" },
                  { value: "stable", icon: Minus, label: "Stabile" },
                  { value: "down", icon: TrendingDown, label: "In calo" },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={h.metric_trend === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => update(h.position, { metric_trend: opt.value })}
                    disabled={readOnly}
                    className="gap-1"
                  >
                    <opt.icon className="h-3.5 w-3.5" />
                    <span className="text-xs hidden sm:inline">{opt.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
