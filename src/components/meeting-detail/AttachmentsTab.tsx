import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Download, FolderOpen, Upload, Loader2, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  meeting: Tables<"meetings">;
}

export function AttachmentsTab({ meeting }: Props) {
  const tenantId = meeting.tenant_id;
  const meetingId = meeting.id;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "org_admin" || user?.role === "information_officer" || user?.role === "superadmin";

  // Admin upload state
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch all active users (not just dirigenti, for admin upload)
  const allUsersQuery = useQuery({
    queryKey: ["attachments-all-users", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, job_title, role")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

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
        .select("id, user_id, file_name, file_url, file_size, created_at, functional_area_id")
        .eq("meeting_id", meetingId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch functional areas
  const areasQuery = useQuery({
    queryKey: ["attachments-areas", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("functional_areas")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
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

  // Users in selected area (for admin upload)
  const usersInSelectedArea = useQuery({
    queryKey: ["attachments-users-in-area", selectedAreaId, tenantId],
    enabled: !!selectedAreaId && selectedAreaId !== "",
    queryFn: async () => {
      const { data: ufaRows, error } = await supabase
        .from("user_functional_areas")
        .select("user_id")
        .eq("functional_area_id", selectedAreaId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const userIds = (ufaRows ?? []).map((r) => r.user_id);
      return userIds;
    },
  });

  // Admin upload handler
  const handleAdminUpload = useCallback(
    async (file: File) => {
      if (!selectedUserId || !selectedAreaId) {
        toast({ title: "Seleziona area e persona", variant: "destructive" });
        return;
      }
      if (file.type !== "application/pdf") {
        toast({ title: "Solo file PDF", variant: "destructive" });
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "File troppo grande (max 50MB)", variant: "destructive" });
        return;
      }

      setUploading(true);
      const path = `${tenantId}/${meetingId}/${selectedAreaId}_${selectedUserId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("slides")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        toast({ title: "Errore upload", description: uploadError.message, variant: "destructive" });
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("slides").getPublicUrl(path);

      // Check if exists for this user+area+meeting
      const { data: existingSlide } = await supabase
        .from("slide_uploads")
        .select("id")
        .eq("meeting_id", meetingId)
        .eq("user_id", selectedUserId)
        .eq("functional_area_id", selectedAreaId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (existingSlide?.id) {
        await supabase
          .from("slide_uploads")
          .update({
            file_name: file.name,
            file_size: file.size,
            file_url: urlData.publicUrl,
          })
          .eq("id", existingSlide.id);
      } else {
        await supabase.from("slide_uploads").insert({
          meeting_id: meetingId,
          user_id: selectedUserId,
          tenant_id: tenantId,
          functional_area_id: selectedAreaId,
          file_name: file.name,
          file_size: file.size,
          file_url: urlData.publicUrl,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["attachments-slides"] });
      setUploading(false);
      setSelectedUserId("");
      toast({ title: "Allegato caricato con successo" });
    },
    [meetingId, selectedUserId, selectedAreaId, tenantId, queryClient]
  );

  const handleAdminDelete = async (slideId: string, slideUserId: string) => {
    const path = `${tenantId}/${meetingId}/${slideUserId}.pdf`;
    await supabase.storage.from("slides").remove([path]);
    await supabase.from("slide_uploads").delete().eq("id", slideId);
    queryClient.invalidateQueries({ queryKey: ["attachments-slides"] });
    toast({ title: "Allegato eliminato" });
  };

  if (dirigenti.isLoading || slideUploads.isLoading || userFunctionalAreas.isLoading || areasQuery.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  const dirs = dirigenti.data ?? [];
  const slides = slideUploads.data ?? [];
  const ufaData = userFunctionalAreas.data;
  const allAreas = areasQuery.data ?? [];
  const allUsers = allUsersQuery.data ?? [];

  // Build (area_id, user_id) → slides map
  const areaUserSlides = new Map<string, typeof slides>();
  for (const s of slides) {
    const key = `${s.functional_area_id ?? "none"}:${s.user_id}`;
    if (!areaUserSlides.has(key)) areaUserSlides.set(key, []);
    areaUserSlides.get(key)!.push(s);
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
        files: areaUserSlides.get(`${area.id}:${u.id}`) ?? [],
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
        files: areaUserSlides.get(`none:${u.id}`) ?? [],
      })),
    });
  }

  // Filter users for selected area in admin upload
  const areaUserIds = usersInSelectedArea.data ?? [];
  const filteredUsersForUpload = selectedAreaId
    ? allUsers.filter((u) => areaUserIds.includes(u.id))
    : [];

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Admin upload section */}
      {isAdmin && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Upload className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Carica allegato per conto di un utente</span>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground">Area Funzionale</label>
                <Select
                  value={selectedAreaId}
                  onValueChange={(val) => {
                    setSelectedAreaId(val);
                    setSelectedUserId("");
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-[200px]">
                    <SelectValue placeholder="Seleziona area..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allAreas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 min-w-[180px]">
                <label className="text-xs font-medium text-muted-foreground">Persona</label>
                <Select
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                  disabled={!selectedAreaId}
                >
                  <SelectTrigger className="h-8 text-xs w-[200px]">
                    <SelectValue placeholder={selectedAreaId ? "Seleziona persona..." : "Prima seleziona l'area"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUsersForUpload.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                    {filteredUsersForUpload.length === 0 && selectedAreaId && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Nessun utente in questa area</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="sm"
                className="h-8"
                disabled={!selectedUserId || !selectedAreaId || uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {uploading ? "Caricamento..." : "Carica PDF"}
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAdminUpload(file);
                e.target.value = "";
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Existing attachments */}
      {slides.length === 0 && !isAdmin ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nessun allegato caricato per questa riunione.</p>
        </div>
      ) : slides.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nessun allegato ancora caricato. Usa il modulo sopra per caricare.</p>
        </div>
      ) : (
        groups.map((group) => {
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
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                                  <a href={f.file_url} target="_blank" rel="noopener noreferrer">
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                                    onClick={() => handleAdminDelete(f.id, f.user_id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
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
        })
      )}
    </div>
  );
}
