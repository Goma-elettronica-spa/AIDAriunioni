import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, FolderOpen } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
}

export function AttachmentsTab({ meeting }: Props) {
  const tenantId = meeting.tenant_id;
  const meetingId = meeting.id;

  // Fetch dirigenti
  const dirigenti = useQuery({
    queryKey: ["attachments-dirigenti", tenantId],
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

  // Fetch slide uploads
  const slideUploads = useQuery({
    queryKey: ["attachments-slides", meetingId, tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("slide_uploads")
        .select("id, user_id, file_name, file_url, file_size, created_at")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch user functional areas
  const userFunctionalAreas = useQuery({
    queryKey: ["attachments-user-areas", tenantId],
    enabled: !!dirigenti.data,
    queryFn: async () => {
      const userIds = dirigenti.data!.map((d) => d.id);
      if (!userIds.length) return { userAreas: [] as { user_id: string; functional_area_id: string }[], areas: [] as { id: string; name: string }[] };

      const { data: ufa, error: ufaError } = await supabase
        .from("user_functional_areas")
        .select("user_id, functional_area_id")
        .in("user_id", userIds);
      if (ufaError) throw ufaError;

      const areaIds = [...new Set((ufa ?? []).map((r) => r.functional_area_id))];
      let areas: { id: string; name: string }[] = [];
      if (areaIds.length) {
        const { data: aData, error: aError } = await supabase
          .from("functional_areas")
          .select("id, name")
          .in("id", areaIds)
          .order("name");
        if (aError) throw aError;
        areas = aData ?? [];
      }

      return { userAreas: ufa ?? [], areas };
    },
  });

  if (dirigenti.isLoading || slideUploads.isLoading || userFunctionalAreas.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const dirs = dirigenti.data ?? [];
  const slides = slideUploads.data ?? [];
  const ufaData = userFunctionalAreas.data;

  // Build user → slides map
  const userSlides = new Map<string, typeof slides>();
  for (const s of slides) {
    if (!userSlides.has(s.user_id)) userSlides.set(s.user_id, []);
    userSlides.get(s.user_id)!.push(s);
  }

  // Build user → area map
  const userAreaMap = new Map<string, string[]>();
  if (ufaData) {
    for (const ua of ufaData.userAreas) {
      if (!userAreaMap.has(ua.user_id)) userAreaMap.set(ua.user_id, []);
      userAreaMap.get(ua.user_id)!.push(ua.functional_area_id);
    }
  }

  // Group by area
  const areas = ufaData?.areas ?? [];
  const usersWithArea = new Set(ufaData?.userAreas.map((ua) => ua.user_id) ?? []);

  type AreaGroup = {
    areaName: string;
    users: { id: string; fullName: string; jobTitle: string | null; files: typeof slides }[];
  };

  const groups: AreaGroup[] = [];

  for (const area of areas) {
    const usersInArea = dirs.filter((d) => {
      const areaIds = userAreaMap.get(d.id) ?? [];
      return areaIds.includes(area.id);
    });

    groups.push({
      areaName: area.name,
      users: usersInArea.map((u) => ({
        id: u.id,
        fullName: u.full_name,
        jobTitle: u.job_title,
        files: userSlides.get(u.id) ?? [],
      })),
    });
  }

  // Users without area
  const usersWithoutArea = dirs.filter((d) => !usersWithArea.has(d.id));
  if (usersWithoutArea.length > 0) {
    groups.push({
      areaName: "Senza Area",
      users: usersWithoutArea.map((u) => ({
        id: u.id,
        fullName: u.full_name,
        jobTitle: u.job_title,
        files: userSlides.get(u.id) ?? [],
      })),
    });
  }

  if (slides.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-border rounded-lg">
        <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Nessun allegato caricato per questa riunione.</p>
      </div>
    );
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const totalFiles = group.users.reduce((sum, u) => sum + u.files.length, 0);
        if (totalFiles === 0 && group.users.length === 0) return null;

        return (
          <div key={group.areaName}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">{group.areaName}</h3>
              <Badge variant="outline" className="text-[10px] font-mono">
                {totalFiles} file
              </Badge>
            </div>

            <div className="space-y-2">
              {group.users.map((u) => (
                <Card key={u.id} className="border border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-foreground">{u.fullName}</span>
                      {u.jobTitle && (
                        <span className="text-xs text-muted-foreground">· {u.jobTitle}</span>
                      )}
                    </div>

                    {u.files.length > 0 ? (
                      <div className="space-y-1.5">
                        {u.files.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-sm text-foreground truncate">{f.file_name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatSize(f.file_size)}
                              </span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                              <a href={f.file_url} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nessun file caricato</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
