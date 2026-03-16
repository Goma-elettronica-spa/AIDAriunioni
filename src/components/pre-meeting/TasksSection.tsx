import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  meetingId: string;
  userId: string;
  tenantId: string;
  readOnly: boolean;
  onSaved: () => void;
  onComplete: (complete: boolean) => void;
}

interface TaskRow {
  id: string | null;
  title: string;
  description: string;
  owner_user_id: string;
  deadline_type: string;
}

function getDeadlineDate(type: string): string {
  const now = new Date();
  if (type === "end_quarter") {
    const q = Math.ceil((now.getMonth() + 1) / 3);
    return new Date(now.getFullYear(), q * 3, 0).toISOString().split("T")[0];
  }
  if (type === "next_quarter") {
    const q = Math.ceil((now.getMonth() + 1) / 3) + 1;
    if (q > 4) return new Date(now.getFullYear() + 1, 3, 0).toISOString().split("T")[0];
    return new Date(now.getFullYear(), q * 3, 0).toISOString().split("T")[0];
  }
  // next_meeting: default to 30 days from now
  const d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().split("T")[0];
}

export function TasksSection({
  meetingId, userId, tenantId, readOnly, onSaved, onComplete,
}: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const users = useQuery({
    queryKey: ["premeeting-users", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const existing = useQuery({
    queryKey: ["premeeting-tasks", meetingId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("board_tasks")
        .select("id, title, description, owner_user_id, deadline_type")
        .eq("meeting_id", meetingId)
        .eq("created_by_user_id", userId)
        .eq("tenant_id", tenantId)
        .eq("source", "pre_meeting");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!existing.data || loaded) return;
    if (existing.data.length > 0) {
      setTasks(
        existing.data.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description ?? "",
          owner_user_id: t.owner_user_id,
          deadline_type: t.deadline_type,
        }))
      );
    }
    setLoaded(true);
  }, [existing.data, loaded]);

  const save = useCallback(
    async (rows: TaskRow[]) => {
      const toSave = rows.filter((r) => r.title.trim());

      for (const row of toSave) {
        const payload = {
          title: row.title.trim(),
          description: row.description.trim() || null,
          owner_user_id: row.owner_user_id,
          deadline_type: row.deadline_type,
          deadline_date: getDeadlineDate(row.deadline_type),
        };
        if (row.id) {
          await supabase.from("board_tasks").update(payload).eq("id", row.id);
        } else {
          const { data } = await supabase
            .from("board_tasks")
            .insert({
              ...payload,
              meeting_id: meetingId,
              created_by_user_id: userId,
              tenant_id: tenantId,
              source: "pre_meeting",
              status: "todo",
            })
            .select("id")
            .single();
          if (data) row.id = data.id;
        }
      }
      setTasks([...toSave.length ? toSave : rows]);
      onSaved();
    },
    [meetingId, userId, tenantId, onSaved]
  );

  const debouncedSave = useCallback(
    (rows: TaskRow[]) => {
      if (readOnly) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => save(rows), 2000);
    },
    [save, readOnly]
  );

  const addTask = () =>
    setTasks((prev) => [
      ...prev,
      { id: null, title: "", description: "", owner_user_id: userId, deadline_type: "next_meeting" },
    ]);

  const updateTask = (index: number, updates: Partial<TaskRow>) => {
    setTasks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      debouncedSave(next);
      return next;
    });
  };

  const removeTask = (index: number) => {
    setTasks((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (removed.id) {
        supabase.from("board_tasks").delete().eq("id", removed.id).then(() => onSaved());
      }
      return next;
    });
  };

  useEffect(() => {
    onComplete(tasks.length > 0 && tasks.some((t) => t.title.trim()));
  }, [tasks, onComplete]);

  if (existing.isLoading) return <Skeleton className="h-28 w-full" />;

  return (
    <Card className="border border-border">
      <CardHeader>
        <CardTitle className="text-base">5. Task</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tasks.map((task, i) => (
          <div key={i} className="space-y-3 p-4 rounded-lg bg-muted/20">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-3">
                <Input
                  placeholder="Titolo task"
                  value={task.title}
                  onChange={(e) => updateTask(i, { title: e.target.value })}
                  disabled={readOnly}
                />
                <Textarea
                  placeholder="Descrizione (opzionale)"
                  value={task.description}
                  onChange={(e) => updateTask(i, { description: e.target.value })}
                  disabled={readOnly}
                  rows={2}
                />
                <div>
                  <Label className="text-xs text-muted-foreground">Owner</Label>
                  <Select
                    value={task.owner_user_id}
                    onValueChange={(v) => updateTask(i, { owner_user_id: v })}
                    disabled={readOnly}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {users.data?.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Scadenza</Label>
                  <RadioGroup
                    value={task.deadline_type}
                    onValueChange={(v) => updateTask(i, { deadline_type: v })}
                    disabled={readOnly}
                    className="flex flex-wrap gap-4 mt-1"
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="next_meeting" id={`dl-m-${i}`} />
                      <Label htmlFor={`dl-m-${i}`} className="text-xs font-normal cursor-pointer">
                        Prossima Riunione
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="end_quarter" id={`dl-q-${i}`} />
                      <Label htmlFor={`dl-q-${i}`} className="text-xs font-normal cursor-pointer">
                        Fine Quarter ({getDeadlineDate("end_quarter")})
                      </Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="next_quarter" id={`dl-nq-${i}`} />
                      <Label htmlFor={`dl-nq-${i}`} className="text-xs font-normal cursor-pointer">
                        Quarter Succ. ({getDeadlineDate("next_quarter")})
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeTask(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessun task aggiunto
          </p>
        )}
        {!readOnly && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={addTask}>
            <Plus className="h-3 w-3 mr-1" />
            Aggiungi Task
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
