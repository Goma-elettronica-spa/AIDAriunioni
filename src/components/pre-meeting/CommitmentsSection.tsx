import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  meetingId: string;
  userId: string;
  tenantId: string;
  type: "monthly" | "quarterly";
  title: string;
  readOnly: boolean;
  onSaved: () => void;
  onComplete: (complete: boolean) => void;
}

interface CommitmentRow {
  id: string | null;
  description: string;
}

export function CommitmentsSection({
  meetingId, userId, tenantId, type, title, readOnly, onSaved, onComplete,
}: Props) {
  const [items, setItems] = useState<CommitmentRow[]>([{ id: null, description: "" }]);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const existing = useQuery({
    queryKey: ["commitments", meetingId, userId, type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commitments")
        .select("id, description")
        .eq("meeting_id", meetingId)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .eq("type", type);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!existing.data || loaded) return;
    if (existing.data.length > 0) {
      setItems(existing.data.map((c) => ({ id: c.id, description: c.description })));
    }
    setLoaded(true);
  }, [existing.data, loaded]);

  const save = useCallback(
    async (rows: CommitmentRow[]) => {
      const toSave = rows.filter((r) => r.description.trim());
      if (!toSave.length) return;

      // Delete existing that are no longer present
      const existingIds = rows.filter((r) => r.id).map((r) => r.id!);
      const allExisting = existing.data?.map((e) => e.id) ?? [];
      const toDelete = allExisting.filter((id) => !existingIds.includes(id));
      if (toDelete.length) {
        await supabase.from("commitments").delete().in("id", toDelete);
      }

      for (const row of toSave) {
        if (row.id) {
          await supabase
            .from("commitments")
            .update({ description: row.description.trim() })
            .eq("id", row.id);
        } else {
          const { data } = await supabase
            .from("commitments")
            .insert({
              meeting_id: meetingId,
              user_id: userId,
              tenant_id: tenantId,
              type,
              description: row.description.trim(),
              status: "pending",
            })
            .select("id")
            .single();
          if (data) {
            row.id = data.id;
          }
        }
      }
      setItems([...toSave]);
      onSaved();
    },
    [meetingId, userId, tenantId, type, existing.data, onSaved]
  );

  const debouncedSave = useCallback(
    (rows: CommitmentRow[]) => {
      if (readOnly) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(rows), 2000);
    },
    [save, readOnly]
  );

  const updateItem = (index: number, description: string) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], description };
      debouncedSave(next);
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { id: null, description: "" }]);

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) return [{ id: null, description: "" }];
      debouncedSave(next);
      return next;
    });
  };

  useEffect(() => {
    const hasSome = items.some((i) => i.description.trim());
    onComplete(hasSome);
  }, [items, onComplete]);

  if (existing.isLoading) return <Skeleton className="h-28 w-full" />;

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="Descrivi l'impegno"
              value={item.description}
              onChange={(e) => updateItem(i, e.target.value)}
              disabled={readOnly}
            />
            {!readOnly && items.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => removeItem(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {!readOnly && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={addItem}>
            <Plus className="h-3 w-3 mr-1" />
            Aggiungi impegno
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
