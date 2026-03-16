import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  UserPlus, Pencil, Power, Check, X, BarChart3, ChevronDown, ChevronRight,
  Plus, EyeOff,
} from "lucide-react";
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";
import KpiManagementSheet from "@/components/team/KpiManagementSheet";

// ── Types ────────────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  job_title: string | null;
  is_active: boolean;
};

type FunctionalArea = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type UserFunctionalArea = {
  id: string;
  user_id: string;
  functional_area_id: string;
  tenant_id: string;
  created_at: string;
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

const roleConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline"; className?: string }> = {
  org_admin: { label: "Org Admin", variant: "default", className: "bg-black text-white hover:bg-black/90" },
  information_officer: { label: "Info Officer", variant: "default", className: "bg-blue-600 text-white hover:bg-blue-700" },
  dirigente: { label: "Dirigente", variant: "secondary" },
};

// ── Helper components ────────────────────────────────────────────────────────

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

// ── Inline editable job title ────────────────────────────────────────────────

function InlineJobTitle({
  value,
  userId,
  tenantId,
  currentUserId,
  canEdit,
}: {
  value: string | null;
  userId: string;
  tenantId: string;
  currentUserId: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (newTitle: string) => {
      const { error } = await supabase
        .from("users")
        .update({ job_title: newTitle || null })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_data, newTitle) => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      writeAuditLog({
        tenantId,
        userId: currentUserId,
        action: "update",
        entityType: "user",
        entityId: userId,
        oldValues: { job_title: value },
        newValues: { job_title: newTitle || null },
      });
      setEditing(false);
      toast({ title: "Ruolo organizzativo aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (draft.trim() !== (value ?? "")) {
      mutation.mutate(draft.trim());
    } else {
      setEditing(false);
    }
  };

  if (editing && canEdit) {
    return (
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-36 text-sm"
        autoFocus
        placeholder="es. CEO, CFO..."
      />
    );
  }

  return (
    <span
      className={canEdit ? "cursor-pointer hover:underline text-sm" : "text-sm text-muted-foreground"}
      onClick={() => {
        if (canEdit) {
          setDraft(value ?? "");
          setEditing(true);
        }
      }}
    >
      {value || "\u2014"}
    </span>
  );
}

// ── Area badges for a user (with add/remove) ────────────────────────────────

function UserAreaBadges({
  userId,
  tenantId,
  currentUserId,
  userAreaIds,
  allAreas,
  canEdit,
  onChanged,
}: {
  userId: string;
  tenantId: string;
  currentUserId: string;
  userAreaIds: string[];
  allAreas: FunctionalArea[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const addMutation = useMutation({
    mutationFn: async (areaId: string) => {
      const { error } = await (supabase.from as any)("user_functional_areas")
        .insert({ user_id: userId, functional_area_id: areaId, tenant_id: tenantId });
      if (error) throw error;
    },
    onSuccess: (_data, areaId) => {
      onChanged();
      const area = allAreas.find((a) => a.id === areaId);
      writeAuditLog({
        tenantId,
        userId: currentUserId,
        action: "create",
        entityType: "user_functional_area",
        entityId: userId,
        newValues: { functional_area_id: areaId, area_name: area?.name },
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (areaId: string) => {
      const { error } = await (supabase.from as any)("user_functional_areas")
        .delete()
        .eq("user_id", userId)
        .eq("functional_area_id", areaId);
      if (error) throw error;
    },
    onSuccess: (_data, areaId) => {
      onChanged();
      const area = allAreas.find((a) => a.id === areaId);
      writeAuditLog({
        tenantId,
        userId: currentUserId,
        action: "delete",
        entityType: "user_functional_area",
        entityId: userId,
        oldValues: { functional_area_id: areaId, area_name: area?.name },
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const assignedAreas = allAreas.filter((a) => userAreaIds.includes(a.id));
  const unassignedAreas = allAreas.filter((a) => !userAreaIds.includes(a.id));

  return (
    <div className="flex items-center flex-wrap gap-1">
      {assignedAreas.map((area) => (
        <Badge key={area.id} variant="outline" className="inline-flex items-center text-xs gap-1">
          {area.name}
          {canEdit && (
            <button
              type="button"
              className="ml-0.5 rounded-full hover:bg-muted p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                removeMutation.mutate(area.id);
              }}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </Badge>
      ))}
      {canEdit && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-dashed border-border text-muted-foreground hover:bg-muted"
              onClick={(e) => e.stopPropagation()}
            >
              <Plus className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start" onClick={(e) => e.stopPropagation()}>
            {unassignedAreas.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Tutte le aree assegnate</p>
            ) : (
              <div className="space-y-1">
                {unassignedAreas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    className="flex items-center w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted"
                    onClick={() => {
                      addMutation.mutate(area.id);
                    }}
                  >
                    {area.name}
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;

  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
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
  const [invAreaIds, setInvAreaIds] = useState<string[]>([]);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editRole, setEditRole] = useState("");

  // KPI sheet
  const [kpiUser, setKpiUser] = useState<{ id: string; name: string } | null>(null);

  // New area inline
  const [newAreaName, setNewAreaName] = useState("");
  const [addingArea, setAddingArea] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState("");

  const isAdmin = user?.role === "org_admin" || user?.role === "information_officer";
  const isOrgAdmin = user?.role === "org_admin";

  // ── Queries ──────────────────────────────────────────────────────────────

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

  const functionalAreas = useQuery({
    queryKey: ["functional-areas", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("functional_areas")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as FunctionalArea[];
    },
  });

  const userFunctionalAreas = useQuery({
    queryKey: ["user-functional-areas", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("user_functional_areas")
        .select("*")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as UserFunctionalArea[];
    },
  });

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

  const latestEntries = useQuery({
    queryKey: ["kpi-latest-entries", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_entries")
        .select("id, kpi_id, current_value, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, KpiEntry>();
      for (const row of data ?? []) {
        if (!map.has(row.kpi_id)) {
          map.set(row.kpi_id, row as KpiEntry);
        }
      }
      return map;
    },
  });

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

  // ── Derived data ─────────────────────────────────────────────────────────

  const areas = functionalAreas.data ?? [];

  // Map: userId -> array of area IDs
  const userAreaMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const ufa of userFunctionalAreas.data ?? []) {
      if (!map[ufa.user_id]) map[ufa.user_id] = [];
      map[ufa.user_id].push(ufa.functional_area_id);
    }
    return map;
  }, [userFunctionalAreas.data]);

  const kpisByUser = useMemo(() => {
    const map: Record<string, KpiDef[]> = {};
    for (const kpi of allKpis.data ?? []) {
      if (!map[kpi.user_id]) map[kpi.user_id] = [];
      map[kpi.user_id].push(kpi);
    }
    return map;
  }, [allKpis.data]);

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
      if (areaFilter !== "all") {
        const uAreas = userAreaMap[u.id] ?? [];
        if (!uAreas.includes(areaFilter)) return false;
      }
      return true;
    });
  }, [users.data, roleFilter, statusFilter, areaFilter, userAreaMap]);

  const toggleExpanded = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // ── Mutations ────────────────────────────────────────────────────────────

  // Functional area CRUD
  const createAreaMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await (supabase.from as any)("functional_areas")
        .insert({ tenant_id: tenantId, name });
      if (error) throw error;
    },
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["functional-areas"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "create",
        entityType: "functional_area",
        entityId: crypto.randomUUID(),
        newValues: { name },
      });
      setNewAreaName("");
      setAddingArea(false);
      toast({ title: "Area creata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const updateAreaMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase.from as any)("functional_areas")
        .update({ name })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id, name }) => {
      queryClient.invalidateQueries({ queryKey: ["functional-areas"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "functional_area",
        entityId: id,
        newValues: { name },
      });
      setEditingAreaId(null);
      toast({ title: "Area aggiornata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteAreaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("functional_areas")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["functional-areas"] });
      queryClient.invalidateQueries({ queryKey: ["user-functional-areas"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "delete",
        entityType: "functional_area",
        entityId: id,
      });
      toast({ title: "Area eliminata" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // User invite
  const inviteMutation = useMutation({
    mutationFn: async () => {
      const newUserId = crypto.randomUUID();
      const { error } = await supabase.from("users").insert({
        id: newUserId,
        email: invEmail.trim().toLowerCase(),
        full_name: invName.trim(),
        job_title: invTitle.trim() || null,
        role: invRole,
        tenant_id: tenantId!,
      });
      if (error) throw error;

      // Add functional areas
      if (invAreaIds.length > 0) {
        const rows = invAreaIds.map((areaId) => ({
          user_id: newUserId,
          functional_area_id: areaId,
          tenant_id: tenantId!,
        }));
        const { error: areaError } = await (supabase.from as any)("user_functional_areas")
          .insert(rows);
        if (areaError) throw areaError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      queryClient.invalidateQueries({ queryKey: ["user-functional-areas"] });
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
      setInvAreaIds([]);
      toast({
        title: "Utente creato",
        description: "L'utente ricevera' il magic link al primo accesso",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // User edit
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
          oldValues: { full_name: editUser.full_name, role: editUser.role, job_title: editUser.job_title },
          newValues: { full_name: editName.trim(), role: editRole, job_title: editTitle.trim() || null },
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

  // Inline role change
  const changeRoleMutation = useMutation({
    mutationFn: async ({ id, newRole }: { id: string; newRole: string }) => {
      const { error } = await supabase
        .from("users")
        .update({ role: newRole })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id, newRole }) => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
      const targetUser = users.data?.find((u) => u.id === id);
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "user",
        entityId: id,
        oldValues: { role: targetUser?.role },
        newValues: { role: newRole },
      });
      toast({ title: "Permessi aggiornati" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // KPI toggles
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

  // Join request mutations
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

  // ── Handlers ─────────────────────────────────────────────────────────────

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

  const handleInvAreaToggle = (areaId: string, checked: boolean) => {
    setInvAreaIds((prev) =>
      checked ? [...prev, areaId] : prev.filter((id) => id !== areaId)
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

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
                className="flex items-center justify-between border border-border rounded-lg p-6"
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

      {/* Aree Funzionali management strip */}
      {isOrgAdmin && (
        <div className="flex items-center flex-wrap gap-2 p-6 border border-border rounded-lg bg-muted/30">
          <span className="text-sm font-medium text-foreground mr-2">Aree Funzionali:</span>
          {areas.map((area) => (
            <span key={area.id}>
              {editingAreaId === area.id ? (
                <span className="inline-flex items-center gap-1">
                  <Input
                    value={editingAreaName}
                    onChange={(e) => setEditingAreaName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editingAreaName.trim()) {
                        updateAreaMutation.mutate({ id: area.id, name: editingAreaName.trim() });
                      }
                      if (e.key === "Escape") setEditingAreaId(null);
                    }}
                    className="h-7 w-28 text-xs"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-muted"
                    onClick={() => {
                      if (editingAreaName.trim()) {
                        updateAreaMutation.mutate({ id: area.id, name: editingAreaName.trim() });
                      }
                    }}
                  >
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-muted"
                    onClick={() => setEditingAreaId(null)}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </span>
              ) : (
                <Badge
                  variant="outline"
                  className="inline-flex items-center text-xs gap-1.5 cursor-pointer hover:bg-muted"
                  onClick={() => {
                    setEditingAreaId(area.id);
                    setEditingAreaName(area.name);
                  }}
                >
                  {area.name}
                  <button
                    type="button"
                    className="ml-0.5 rounded-full hover:bg-red-100 p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAreaMutation.mutate(area.id);
                    }}
                  >
                    <X className="h-2.5 w-2.5 text-muted-foreground hover:text-red-600" />
                  </button>
                </Badge>
              )}
            </span>
          ))}
          {addingArea ? (
            <span className="inline-flex items-center gap-1">
              <Input
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newAreaName.trim()) {
                    createAreaMutation.mutate(newAreaName.trim());
                  }
                  if (e.key === "Escape") {
                    setAddingArea(false);
                    setNewAreaName("");
                  }
                }}
                placeholder="Nome area..."
                className="h-7 w-28 text-xs"
                autoFocus
              />
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => {
                  if (newAreaName.trim()) createAreaMutation.mutate(newAreaName.trim());
                }}
              >
                <Check className="h-3.5 w-3.5 text-green-600" />
              </button>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => {
                  setAddingArea(false);
                  setNewAreaName("");
                }}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-dashed border-border text-muted-foreground hover:bg-muted"
              onClick={() => setAddingArea(true)}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Area Funzionale" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le aree</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Permessi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i permessi</SelectItem>
            <SelectItem value="org_admin">Org Admin</SelectItem>
            <SelectItem value="information_officer">Info Officer</SelectItem>
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

      {/* Main User Table */}
      {users.isLoading || functionalAreas.isLoading ? (
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
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead>Ruolo Org</TableHead>
                <TableHead>Permessi</TableHead>
                <TableHead className="hidden lg:table-cell">Aree Funzionali</TableHead>
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
                const uAreaIds = userAreaMap[u.id] ?? [];

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
                      <TableCell className="font-bold">{u.full_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {u.email}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <InlineJobTitle
                          value={u.job_title}
                          userId={u.id}
                          tenantId={tenantId!}
                          currentUserId={user!.id}
                          canEdit={isOrgAdmin}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isOrgAdmin && u.id !== user?.id ? (
                          <Select
                            value={u.role}
                            onValueChange={(newRole) => {
                              changeRoleMutation.mutate({ id: u.id, newRole });
                            }}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs border-0 bg-transparent p-0 shadow-none">
                              <Badge
                                variant={rc.variant}
                                className={`inline-flex items-center text-xs ${rc.className ?? ""}`}
                              >
                                {rc.label}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="org_admin">Org Admin</SelectItem>
                              <SelectItem value="information_officer">Info Officer</SelectItem>
                              <SelectItem value="dirigente">Dirigente</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant={rc.variant}
                            className={`inline-flex items-center text-xs ${rc.className ?? ""}`}
                          >
                            {rc.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                        <UserAreaBadges
                          userId={u.id}
                          tenantId={tenantId!}
                          currentUserId={user!.id}
                          userAreaIds={uAreaIds}
                          allAreas={areas}
                          canEdit={isOrgAdmin}
                          onChanged={() => {
                            queryClient.invalidateQueries({ queryKey: ["user-functional-areas"] });
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="inline-flex items-center text-xs cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setKpiUser({ id: u.id, name: u.full_name });
                          }}
                        >
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
                            onClick={() => openEdit(u)}
                            title="Modifica utente"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
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
                            onClick={() =>
                              toggleActive.mutate({
                                id: u.id,
                                is_active: u.is_active,
                              })
                            }
                            disabled={u.id === user?.id}
                            title={u.is_active ? "Disattiva" : "Attiva"}
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
                        <TableCell colSpan={9} className="p-0 bg-muted/20">
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
              <Label htmlFor="inv-title">Ruolo Organizzativo (Job Title)</Label>
              <Input
                id="inv-title"
                value={invTitle}
                onChange={(e) => setInvTitle(e.target.value)}
                placeholder="es. CEO, CFO, Direttore Commerciale"
              />
            </div>
            <div className="space-y-2">
              <Label>Permessi</Label>
              <Select value={invRole} onValueChange={setInvRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="information_officer">Info Officer</SelectItem>
                  <SelectItem value="dirigente">Dirigente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {areas.length > 0 && (
              <div className="space-y-2">
                <Label>Aree Funzionali</Label>
                <div className="grid gap-2 max-h-32 overflow-y-auto border border-border rounded-md p-3">
                  {areas.map((area) => (
                    <div key={area.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`inv-area-${area.id}`}
                        checked={invAreaIds.includes(area.id)}
                        onCheckedChange={(checked) => handleInvAreaToggle(area.id, checked === true)}
                      />
                      <Label
                        htmlFor={`inv-area-${area.id}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {area.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                  !invName.trim()
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
              <Label htmlFor="edit-title">Ruolo Organizzativo (Job Title)</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="es. CEO, CFO, Direttore Commerciale"
              />
            </div>
            <div className="space-y-2">
              <Label>Permessi</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="information_officer">Info Officer</SelectItem>
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
