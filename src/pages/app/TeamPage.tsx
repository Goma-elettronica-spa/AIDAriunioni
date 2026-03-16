import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserPlus, Pencil, Power, Check, X, BarChart3, ChevronDown, ChevronRight, Plus, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";
import KpiManagementSheet from "@/components/team/KpiManagementSheet";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  job_title: string | null;
  is_active: boolean;
};

type KpiDef = {
  id: string;
  name: string;
  unit: string;
  direction: string;
  target_value: number | null;
  is_active: boolean;
  is_required: boolean;
  user_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
};

type KpiEntry = {
  id: string;
  kpi_id: string;
  current_value: number;
  created_at: string;
};

type JoinRequest = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  status: string;
  created_at: string;
};

const roleConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  org_admin: { label: "Org Admin", variant: "default" },
  information_officer: { label: "Info Officer", variant: "outline" },
  dirigente: { label: "Dirigente", variant: "secondary" },
};

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{
          backgroundColor: active
            ? "hsl(var(--status-done))"
            : "hsl(var(--status-stuck))",
        }}
      />
      {active ? "Attivo" : "Inattivo"}
    </span>
  );
}

function InlineKpiValue({
  entry,
  kpiId,
  canEdit,
  tenantId,
  userId,
}: {
  entry: KpiEntry | undefined;
  kpiId: string;
  canEdit: boolean;
  tenantId: string;
  userId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry?.current_value != null ? String(entry.current_value) : "");
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (newValue: number) => {
      if (entry?.id) {
        const { error } = await supabase
          .from("kpi_entries")
          .update({ current_value: newValue })
          .eq("id", entry.id);
        if (error) throw error;
      } else {
        // Find latest meeting for this tenant to associate the entry
        const { data: latestMeeting } = await supabase
          .from("meetings")
          .select("id")
          .eq("tenant_id", tenantId)
          .order("date", { ascending: false })
          .limit(1)
          .single();

        if (!latestMeeting) throw new Error("Nessun meeting trovato");

        const { error } = await supabase.from("kpi_entries").insert({
          kpi_id: kpiId,
          meeting_id: latestMeeting.id,
          user_id: userId,
          tenant_id: tenantId,
          current_value: newValue,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_data, newValue) => {
      queryClient.invalidateQueries({ queryKey: ["kpi-latest-entries"] });
      writeAuditLog({
        tenantId,
        userId,
        action: entry?.id ? "update" : "create",
        entityType: "kpi_entry",
        entityId: entry?.id ?? kpiId,
        oldValues: entry?.current_value != null ? { current_value: entry.current_value } : null,
        newValues: { current_value: newValue },
        modifiedForUserId: userId,
      });
      setEditing(false);
      toast({ title: "Valore KPI aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      saveMutation.mutate(num);
    } else {
      setEditing(false);
    }
  };

  if (editing && canEdit) {
    return (
      <Input
        type="number"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-28 text-sm"
        autoFocus
      />
    );
  }

  const displayValue = entry?.current_value != null
    ? new Intl.NumberFormat("it-IT").format(entry.current_value)
    : "\u2014";

  return (
    <span
      className={canEdit ? "cursor-pointer hover:underline text-sm font-mono" : "text-sm font-mono"}
      onClick={() => {
        if (canEdit) {
          setValue(entry?.current_value != null ? String(entry.current_value) : "");
          setEditing(true);
        }
      }}
    >
      {displayValue}
    </span>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;

  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [showHiddenKpis, setShowHiddenKpis] = useState(false);

  // Confirm dialog for deactivating KPI
  const [confirmHideKpi, setConfirmHideKpi] = useState<{ id: string; name: string } | null>(null);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invTitle, setInvTitle] = useState("");
  const [invRole, setInvRole] = useState("dirigente");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editRole, setEditRole] = useState("");

  // KPI sheet
  const [kpiUser, setKpiUser] = useState<{ id: string; name: string } | null>(null);

  const isAdmin = user?.role === "org_admin" || user?.role === "information_officer";

  const users = useQuery({
    queryKey: ["team-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, role, job_title, is_active")
        .eq("tenant_id", tenantId!)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data as UserRow[];
    },
  });

  // Fetch ALL kpi_definitions for the tenant
  const allKpis = useQuery({
    queryKey: ["kpi-all-definitions", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as KpiDef[];
    },
  });

  // Fetch latest kpi_entry for each KPI definition
  const latestEntries = useQuery({
    queryKey: ["kpi-latest-entries", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Get all entries ordered by created_at desc, then deduplicate client-side
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Keep only the latest entry per kpi_id
      const map = new Map<string, KpiEntry>();
      for (const row of data ?? []) {
        if (!map.has(row.kpi_id)) {
          map.set(row.kpi_id, row as KpiEntry);
        }
      }
      return map;
    },
  });

  // Fetch pending join requests
  const joinRequests = useQuery({
    queryKey: ["join-requests", tenantId],
    enabled: !!tenantId && user?.role === "org_admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("join_requests")
        .select("id, user_id, email, full_name, status, created_at")
        .eq("tenant_id", tenantId!)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as JoinRequest[];
    },
  });

  // Group KPIs by user_id
  const kpisByUser = useMemo(() => {
    const map: Record<string, KpiDef[]> = {};
    for (const kpi of allKpis.data ?? []) {
      if (!map[kpi.user_id]) map[kpi.user_id] = [];
      map[kpi.user_id].push(kpi);
    }
    return map;
  }, [allKpis.data]);

  // KPI counts (active only)
  const kpiCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const kpi of allKpis.data ?? []) {
      if (kpi.is_active) {
        counts[kpi.user_id] = (counts[kpi.user_id] || 0) + 1;
      }
    }
    return counts;
  }, [allKpis.data]);

  const filtered = useMemo(() => {
    if (!users.data) return [];
    return users.data.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      return true;
    });
  }, [users.data, roleFilter, statusFilter]);

  const toggleExpanded = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("users").insert({
        id: crypto.randomUUID(),
        email: invEmail.trim().toLowerCase(),
        full_name: invName.trim(),
        job_title: invTitle.trim(),
        role: invRole,
        tenant_id: tenantId!,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "create",
        entityType: "user",
        entityId: crypto.randomUUID(),
        newValues: { email: invEmail.trim().toLowerCase(), full_name: invName.trim(), role: invRole },
      });
      setInviteOpen(false);
      setInvEmail("");
      setInvName("");
      setInvTitle("");
      setInvRole("dirigente");
      toast({
        title: "Utente creato",
        description: "L'utente ricevera' il magic link al primo accesso",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      const { error } = await supabase
        .from("users")
        .update({
          full_name: editName.trim(),
          job_title: editTitle.trim() || null,
          role: editRole,
        })
        .eq("id", editUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      if (editUser) {
        writeAuditLog({
          tenantId: tenantId!,
          userId: user!.id,
          action: "update",
          entityType: "user",
          entityId: editUser.id,
          oldValues: { full_name: editUser.full_name, role: editUser.role },
          newValues: { full_name: editName.trim(), role: editRole },
        });
      }
      setEditOpen(false);
      toast({ title: "Utente aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("users")
        .update({ is_active: !is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "user",
        entityId: variables.id,
        oldValues: { is_active: variables.is_active },
        newValues: { is_active: !variables.is_active },
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Toggle is_required on a KPI definition
  const toggleRequiredMutation = useMutation({
    mutationFn: async ({ id, is_required }: { id: string; is_required: boolean }) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_required: !is_required })
        .eq("id", id);
      if (error) throw error;
      return !is_required;
    },
    onSuccess: (_newVal, variables) => {
      queryClient.invalidateQueries({ queryKey: ["kpi-all-definitions"] });
      const kpi = allKpis.data?.find((k) => k.id === variables.id);
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "kpi_definition",
        entityId: variables.id,
        oldValues: { is_required: variables.is_required },
        newValues: { is_required: !variables.is_required },
      });
      toast({
        title: `KPI ${kpi?.name ?? ""} ora e' ${!variables.is_required ? "obbligatorio" : "opzionale"}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Toggle is_active on a KPI definition
  const toggleKpiActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("kpi_definitions")
        .update({ is_active: !is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["kpi-all-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-counts"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "kpi_definition",
        entityId: variables.id,
        oldValues: { is_active: variables.is_active },
        newValues: { is_active: !variables.is_active },
      });
      setConfirmHideKpi(null);
      toast({ title: "Visibilita' KPI aggiornata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Approve join request
  const approveMutation = useMutation({
    mutationFn: async (request: JoinRequest) => {
      const { error: updateError } = await supabase
        .from("join_requests")
        .update({ status: "approved" })
        .eq("id", request.id);
      if (updateError) throw updateError;

      const { error: userError } = await supabase.from("users").insert({
        id: request.user_id,
        email: request.email,
        full_name: request.full_name,
        role: "dirigente",
        tenant_id: tenantId!,
      });
      if (userError) throw userError;
    },
    onSuccess: (_data, request) => {
      queryClient.invalidateQueries({ queryKey: ["join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "join_request",
        entityId: request.id,
        newValues: { status: "approved" },
      });
      toast({ title: "Richiesta approvata", description: "L'utente e' stato aggiunto al team." });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Reject join request
  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("join_requests")
        .update({ status: "rejected" })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: (_data, requestId) => {
      queryClient.invalidateQueries({ queryKey: ["join-requests"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "join_request",
        entityId: requestId,
        newValues: { status: "rejected" },
      });
      toast({ title: "Richiesta rifiutata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (u: UserRow) => {
    setEditUser(u);
    setEditName(u.full_name);
    setEditTitle(u.job_title ?? "");
    setEditRole(u.role);
    setEditOpen(true);
  };

  const pendingRequests = joinRequests.data ?? [];
  const entryMap = latestEntries.data ?? new Map<string, KpiEntry>();

  const canEditKpiValue = (targetUserId: string) => {
    if (isAdmin) return true;
    if (user?.role === "dirigente" && user?.id === targetUserId) return true;
    return false;
  };

  return (
    <div className="space-y-section-gap">
      {/* Pending Join Requests Section */}
      {user?.role === "org_admin" && pendingRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Richieste di Accesso</h2>
          <div className="grid gap-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between border border-border rounded-lg p-4"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{req.full_name}</p>
                  <p className="text-xs text-muted-foreground">{req.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Richiesta del{" "}
                    {new Date(req.created_at).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
                    onClick={() => approveMutation.mutate(req)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Approva
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                    onClick={() => rejectMutation.mutate(req.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Rifiuta
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Team</h1>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Invita Utente
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Ruolo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i ruoli</SelectItem>
            <SelectItem value="org_admin">Org Admin</SelectItem>
            <SelectItem value="dirigente">Dirigente</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="active">Attivi</SelectItem>
            <SelectItem value="inactive">Inattivi</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto">
          <Checkbox
            id="show-hidden-kpis"
            checked={showHiddenKpis}
            onCheckedChange={(checked) => setShowHiddenKpis(checked === true)}
          />
          <Label htmlFor="show-hidden-kpis" className="text-sm text-muted-foreground cursor-pointer">
            Mostra KPI nascosti
          </Label>
        </div>
      </div>

      {/* Accordion-style user list */}
      {users.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Nessun utente trovato</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-8"></TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead className="hidden md:table-cell">Job Title</TableHead>
                <TableHead>KPI</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-28">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const rc = roleConfig[u.role] ?? {
                  label: u.role,
                  variant: "secondary" as const,
                };
                const userKpiCount = kpiCountMap[u.id] ?? 0;
                const isExpanded = expandedUsers.has(u.id);
                const userKpis = kpisByUser[u.id] ?? [];
                const visibleKpis = showHiddenKpis
                  ? userKpis
                  : userKpis.filter((k) => k.is_active);

                return (
                  <>
                    <TableRow
                      key={u.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => toggleExpanded(u.id)}
                    >
                      <TableCell className="w-8 px-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{u.full_name}</TableCell>
                      <TableCell>
                        <Badge variant={rc.variant} className="inline-flex items-center text-xs">
                          {rc.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {u.job_title ?? "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="inline-flex items-center text-xs">
                          {userKpiCount}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusDot active={u.is_active} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setKpiUser({ id: u.id, name: u.full_name })}
                            title="Gestisci KPI"
                          >
                            <BarChart3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(u)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              toggleActive.mutate({
                                id: u.id,
                                is_active: u.is_active,
                              })
                            }
                            disabled={u.id === user?.id}
                          >
                            <Power
                              className="h-3.5 w-3.5"
                              style={{
                                color: u.is_active
                                  ? "hsl(var(--status-stuck))"
                                  : "hsl(var(--status-done))",
                              }}
                            />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded KPI section */}
                    {isExpanded && (
                      <TableRow key={`${u.id}-kpis`}>
                        <TableCell colSpan={7} className="p-0 bg-muted/20">
                          <div className="p-6">
                            {visibleKpis.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                Nessun KPI {showHiddenKpis ? "" : "attivo "}per questo utente.
                              </p>
                            ) : (
                              <div className="border border-border rounded-lg overflow-hidden">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/30">
                                      <TableHead className="text-xs">KPI Nome</TableHead>
                                      <TableHead className="text-xs">Unita'</TableHead>
                                      <TableHead className="text-xs">Valore Attuale</TableHead>
                                      <TableHead className="text-xs">Obbligatorio</TableHead>
                                      <TableHead className="text-xs">Visibile</TableHead>
                                      <TableHead className="text-xs w-16">Azioni</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {visibleKpis.map((kpi) => (
                                      <TableRow
                                        key={kpi.id}
                                        className={!kpi.is_active ? "opacity-50" : ""}
                                      >
                                        <TableCell className="text-sm font-medium">
                                          <div className="flex items-center gap-2">
                                            {kpi.name}
                                            {!kpi.is_active && (
                                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="inline-flex items-center text-xs">
                                            {kpi.unit}
                                          </Badge>
                                        </TableCell>
                                        <TableCell>
                                          <InlineKpiValue
                                            entry={entryMap.get(kpi.id)}
                                            kpiId={kpi.id}
                                            canEdit={canEditKpiValue(u.id)}
                                            tenantId={tenantId!}
                                            userId={u.id}
                                          />
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            <Switch
                                              checked={kpi.is_required ?? true}
                                              onCheckedChange={() =>
                                                toggleRequiredMutation.mutate({
                                                  id: kpi.id,
                                                  is_required: kpi.is_required ?? true,
                                                })
                                              }
                                              disabled={!isAdmin}
                                            />
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            <Switch
                                              checked={kpi.is_active}
                                              onCheckedChange={(checked) => {
                                                if (!checked) {
                                                  setConfirmHideKpi({ id: kpi.id, name: kpi.name });
                                                } else {
                                                  toggleKpiActiveMutation.mutate({
                                                    id: kpi.id,
                                                    is_active: kpi.is_active,
                                                  });
                                                }
                                              }}
                                              disabled={!isAdmin}
                                            />
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => setKpiUser({ id: u.id, name: u.full_name })}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            )}
                            {isAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-3"
                                onClick={() => setKpiUser({ id: u.id, name: u.full_name })}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                Aggiungi KPI
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Confirm hide KPI dialog */}
      <AlertDialog open={!!confirmHideKpi} onOpenChange={(open) => !open && setConfirmHideKpi(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nascondere {confirmHideKpi?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              I dati storici saranno preservati. Il KPI non sara' visibile nelle viste ma potra' essere riattivato in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmHideKpi) {
                  toggleKpiActiveMutation.mutate({
                    id: confirmHideKpi.id,
                    is_active: true,
                  });
                }
              }}
            >
              Nascondi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invita Utente</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="inv-email">Email</Label>
              <Input
                id="inv-email"
                type="email"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="nome@azienda.it"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-name">Nome Completo</Label>
              <Input
                id="inv-name"
                value={invName}
                onChange={(e) => setInvName(e.target.value)}
                placeholder="Mario Rossi"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-title">Job Title</Label>
              <Input
                id="inv-title"
                value={invTitle}
                onChange={(e) => setInvTitle(e.target.value)}
                placeholder="Direttore Commerciale"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Ruolo</Label>
              <Select value={invRole} onValueChange={setInvRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                 <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="dirigente">Dirigente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={
                  inviteMutation.isPending ||
                  !invEmail.trim() ||
                  !invName.trim() ||
                  !invTitle.trim()
                }
              >
                {inviteMutation.isPending ? "Creazione..." : "Invita"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Utente</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome Completo</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-title">Job Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ruolo</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="dirigente">Dirigente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={editMutation.isPending || !editName.trim()}
              >
                {editMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* KPI Management Sheet */}
      <KpiManagementSheet
        open={!!kpiUser}
        onOpenChange={(open) => !open && setKpiUser(null)}
        userId={kpiUser?.id ?? ""}
        userName={kpiUser?.name ?? ""}
        tenantId={tenantId!}
      />
    </div>
  );
}
