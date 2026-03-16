import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Check, X, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
  isAdmin: boolean;
}

export function OverviewTab({ meeting, isAdmin }: Props) {
  const tenantId = meeting.tenant_id;
  const meetingId = meeting.id;

  // Fetch dirigenti
  const dirigenti = useQuery({
    queryKey: ["overview-dirigenti", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, job_title")
        .eq("tenant_id", tenantId)
        .eq("role", "dirigente")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch completion data
  const completionData = useQuery({
    queryKey: ["overview-completion", meetingId, tenantId],
    enabled: !!dirigenti.data,
    queryFn: async () => {
      const userIds = dirigenti.data!.map((d) => d.id);
      if (!userIds.length) return { highlights: [], kpiEntries: [], commitments: [], slides: [] };

      const [highlights, kpiEntries, commitments, slides] = await Promise.all([
        supabase
          .from("highlights")
          .select("user_id")
          .eq("meeting_id", meetingId)
          .in("user_id", userIds),
        supabase
          .from("kpi_entries")
          .select("user_id")
          .eq("meeting_id", meetingId)
          .in("user_id", userIds),
        supabase
          .from("commitments")
          .select("user_id")
          .eq("meeting_id", meetingId)
          .in("user_id", userIds),
        supabase
          .from("slide_uploads")
          .select("user_id")
          .eq("meeting_id", meetingId)
          .in("user_id", userIds),
      ]);

      return {
        highlights: new Set(highlights.data?.map((h) => h.user_id) ?? []),
        kpiEntries: new Set(kpiEntries.data?.map((k) => k.user_id) ?? []),
        commitments: new Set(commitments.data?.map((c) => c.user_id) ?? []),
        slides: new Set(slides.data?.map((s) => s.user_id) ?? []),
      };
    },
  });

  const CheckIcon = ({ done }: { done: boolean }) =>
    done ? (
      <Check className="h-4 w-4 mx-auto" style={{ color: "hsl(var(--status-done))" }} />
    ) : (
      <X className="h-4 w-4 mx-auto" style={{ color: "hsl(var(--status-stuck))" }} />
    );

  return (
    <div className="space-y-6">
      {/* Info card */}
      <Card className="border border-border">
        <CardContent className="p-card-padding">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Data</p>
              <p className="font-medium text-foreground">
                {new Date(meeting.scheduled_date).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Trimestre</p>
              <p className="font-medium font-mono text-foreground">{meeting.quarter}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Deadline Pre-Meeting</p>
              <p className="font-medium text-foreground">
                {new Date(meeting.pre_meeting_deadline).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                })}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Stato</p>
              <p className="font-medium text-foreground capitalize">
                {meeting.status.replace("_", " ")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Completion matrix */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Completamento Pre-Meeting
        </h2>

        {dirigenti.isLoading || completionData.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !dirigenti.data?.length ? (
          <p className="text-sm text-muted-foreground">Nessun dirigente nel team.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Dirigente</TableHead>
                  <TableHead className="text-center w-24">KPI</TableHead>
                  <TableHead className="text-center w-24">Highlights</TableHead>
                  <TableHead className="text-center w-24">Impegni</TableHead>
                  <TableHead className="text-center w-24">Slide</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dirigenti.data.map((d) => {
                  const cd = completionData.data;
                  return (
                    <TableRow key={d.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{d.full_name}</p>
                          {d.job_title && (
                            <p className="text-xs text-muted-foreground">{d.job_title}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckIcon done={cd?.kpiEntries instanceof Set && cd.kpiEntries.has(d.id)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckIcon done={cd?.highlights instanceof Set && cd.highlights.has(d.id)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckIcon done={cd?.commitments instanceof Set && cd.commitments.has(d.id)} />
                      </TableCell>
                      <TableCell className="text-center">
                        <CheckIcon done={cd?.slides instanceof Set && cd.slides.has(d.id)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Generate brief button */}
      {isAdmin && (meeting.status === "pre_meeting" || meeting.status === "in_progress") && (
        <Button onClick={() => alert("Generazione brief — funzionalità futura")}>
          <FileText className="h-4 w-4 mr-2" />
          Genera Brief
        </Button>
      )}
    </div>
  );
}
