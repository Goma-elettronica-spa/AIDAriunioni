import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { writeAuditLog } from "@/lib/audit";
import { Plus, Pencil, X, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ──────────────────────────────────────────────────────────────────

type FunctionalArea = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type BoardRole = {
  id: string;
  tenant_id: string;
  name: string;
  functional_area_id: string | null;
  description: string | null;
  created_at: string;
};

type TenantUser = {
  id: string;
  full_name: string;
  job_title: string | null;
  board_role_id: string | null;
  is_active: boolean;
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function BoardRolesPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<FunctionalArea | null>(null);
  const [areaName, setAreaName] = useState("");
  const [areaDescription, setAreaDescription] = useState("");

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<BoardRole | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleAreaId, setRoleAreaId] = useState("");
  const [roleDescription, setRoleDescription] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<BoardRole | null>(null);

  const [areaDeleteConfirmOpen, setAreaDeleteConfirmOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<FunctionalArea | null>(null);
  const [areaKpiCount, setAreaKpiCount] = useState(0);

  // ── Queries ───────────────────────────────────────────────────────────────

  const areasQuery = useQuery({
    queryKey: ["board-roles-areas", tenantId],
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

  const rolesQuery = useQuery({
    queryKey: ["board-roles-roles", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("board_roles")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return (data ?? []) as BoardRole[];
    },
  });

  const usersQuery = useQuery({
    queryKey: ["board-roles-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, job_title, board_role_id, is_active")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as TenantUser[];
    },
  });

  const areas = areasQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const users = usersQuery.data ?? [];

  // ── Derived data ──────────────────────────────────────────────────────────

  const areaMap = useMemo(() => {
    const map = new Map<string, FunctionalArea>();
    for (const a of areas) map.set(a.id, a);
    return map;
  }, [areas]);

  const userByRoleId = useMemo(() => {
    const map = new Map<string, TenantUser>();
    for (const u of users) {
      if (u.board_role_id) map.set(u.board_role_id, u);
    }
    return map;
  }, [users]);

  const rolesByArea = useMemo(() => {
    const map = new Map<string | null, BoardRole[]>();
    for (const r of roles) {
      const key = r.functional_area_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [roles]);

  const unassignedUsers = useMemo(
    () => users.filter((u) => !u.board_role_id),
    [users],
  );

  // Build ordered rows: grouped by area, then "Senza Area" at end
  const tableRows = useMemo(() => {
    const rows: { role: BoardRole; areaName: string; showArea: boolean }[] = [];
    for (const area of areas) {
      const areaRoles = rolesByArea.get(area.id) ?? [];
      areaRoles.forEach((role, idx) => {
        rows.push({ role, areaName: area.name, showArea: idx === 0 });
      });
    }
    const noAreaRoles = rolesByArea.get(null) ?? [];
    noAreaRoles.forEach((role, idx) => {
      rows.push({ role, areaName: "Senza Area", showArea: idx === 0 });
    });
    return rows;
  }, [areas, rolesByArea]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveAreaMutation = useMutation({
    mutationFn: async () => {
      if (editingArea) {
        const { error } = await (supabase.from as any)("functional_areas")
          .update({ name: areaName, description: areaDescription || null })
          .eq("id", editingArea.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("functional_areas")
          .insert({ tenant_id: tenantId, name: areaName, description: areaDescription || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-areas"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: editingArea ? "update" : "create",
        entityType: "functional_area",
        entityId: editingArea?.id ?? crypto.randomUUID(),
        oldValues: editingArea ? { name: editingArea.name, description: editingArea.description } : null,
        newValues: { name: areaName, description: areaDescription || null },
      });
      setAreaDialogOpen(false);
      toast({ title: editingArea ? "Area aggiornata" : "Area creata" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteAreaMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        // Nullify functional_area_id on KPIs that reference this area
        await supabase
          .from("kpi_definitions")
          .update({ functional_area_id: null })
          .eq("functional_area_id", id);

        // Remove user_functional_areas entries for this area
        await (supabase.from as any)("user_functional_areas")
          .delete()
          .eq("functional_area_id", id);
      } catch (_) {
        // These may not exist or may fail — continue with area deletion
        console.warn("Cleanup before area delete had non-critical errors");
      }

      const { error } = await (supabase.from as any)("functional_areas")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-areas"] });
      queryClient.invalidateQueries({ queryKey: ["board-roles-roles"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "delete",
        entityType: "functional_area",
        entityId: id,
      });
      setAreaDeleteConfirmOpen(false);
      setAreaToDelete(null);
      toast({ title: "Area eliminata" });
    },
    onError: (err: any) => {
      toast({ title: "Errore nell'eliminazione dell'area", description: err.message, variant: "destructive" });
    },
  });

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      const areaId = roleAreaId;
      if (!areaId) throw new Error("L'area funzionale è obbligatoria");
      if (editingRole) {
        const { error } = await (supabase.from as any)("board_roles")
          .update({
            name: roleName,
            functional_area_id: areaId,
            description: roleDescription || null,
          })
          .eq("id", editingRole.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("board_roles")
          .insert({
            tenant_id: tenantId,
            name: roleName,
            functional_area_id: areaId,
            description: roleDescription || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-roles"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: editingRole ? "update" : "create",
        entityType: "board_role",
        entityId: editingRole?.id ?? crypto.randomUUID(),
        oldValues: editingRole ? { name: editingRole.name, description: editingRole.description, functional_area_id: editingRole.functional_area_id } : null,
        newValues: { name: roleName, description: roleDescription || null, functional_area_id: roleAreaId },
      });
      setRoleDialogOpen(false);
      toast({ title: editingRole ? "Ruolo aggiornato" : "Ruolo creato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("board_roles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-roles"] });
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "delete",
        entityType: "board_role",
        entityId: id,
      });
      setDeleteConfirmOpen(false);
      setRoleToDelete(null);
      toast({ title: "Ruolo eliminato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const { error } = await (supabase.from as any)("users")
        .update({ board_role_id: roleId })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-users"] });
      const targetUser = users.find((u) => u.id === variables.userId);
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "user",
        entityId: variables.userId,
        oldValues: { board_role_id: targetUser?.board_role_id ?? null },
        newValues: { board_role_id: variables.roleId },
      });
      toast({ title: "Ruolo assegnato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const unassignRoleMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await (supabase.from as any)("users")
        .update({ board_role_id: null })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-users"] });
      const targetUser = users.find((u) => u.id === userId);
      writeAuditLog({
        tenantId: tenantId!,
        userId: user!.id,
        action: "update",
        entityType: "user",
        entityId: userId,
        oldValues: { board_role_id: targetUser?.board_role_id ?? null },
        newValues: { board_role_id: null },
      });
      toast({ title: "Assegnazione rimossa" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openCreateArea = () => {
    setEditingArea(null);
    setAreaName("");
    setAreaDescription("");
    setAreaDialogOpen(true);
  };

  const openEditArea = (area: FunctionalArea) => {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaDescription(area.description ?? "");
    setAreaDialogOpen(true);
  };

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleName("");
    setRoleAreaId("");
    setRoleDescription("");
    setRoleDialogOpen(true);
  };

  const openEditRole = (role: BoardRole) => {
    setEditingRole(role);
    setRoleName(role.name);
    setRoleAreaId(role.functional_area_id ?? "");
    setRoleDescription(role.description ?? "");
    setRoleDialogOpen(true);
  };

  const [areaDeps, setAreaDeps] = useState<{ kpis: number; roles: number }>({ kpis: 0, roles: 0 });
  const [roleDeps, setRoleDeps] = useState<{ hasUser: boolean; userName: string }>({ hasUser: false, userName: "" });

  const handleDeleteArea = async (area: FunctionalArea) => {
    try {
      const [kpiRes, roleRes] = await Promise.all([
        supabase
          .from("kpi_definitions")
          .select("id", { count: "exact", head: true })
          .eq("functional_area_id", area.id),
        (supabase.from as any)("board_roles")
          .select("id", { count: "exact", head: true })
          .eq("functional_area_id", area.id),
      ]);
      const kpiCount = kpiRes.count ?? 0;
      const roleCount = roleRes.count ?? 0;
      setAreaToDelete(area);
      setAreaKpiCount(kpiCount);
      setAreaDeps({ kpis: kpiCount, roles: roleCount });
      setAreaDeleteConfirmOpen(true);
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteRole = (role: BoardRole) => {
    const assigned = userByRoleId.get(role.id);
    setRoleDeps({ hasUser: !!assigned, userName: assigned?.full_name ?? "" });
    setRoleToDelete(role);
    setDeleteConfirmOpen(true);
  };

  const handleAssign = (roleId: string, userId: string) => {
    assignRoleMutation.mutate({ userId, roleId });
  };

  const handleUnassign = (userId: string) => {
    unassignRoleMutation.mutate(userId);
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  const isLoading = areasQuery.isLoading || rolesQuery.isLoading || usersQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Organigramma</h1>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Organigramma</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={openCreateArea}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuova Area
          </Button>
          <Button
            size="sm"
            onClick={openCreateRole}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuovo Ruolo
          </Button>
        </div>
      </div>

      {/* Table */}
      {tableRows.length === 0 ? (
        <div className="rounded-md border border-border p-6">
          <p className="text-sm text-muted-foreground text-center">
            Nessun ruolo o area creata. Inizia configurando le aree funzionali e i ruoli.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left font-medium text-muted-foreground py-2 px-4 w-[18%]">Area Funzionale</th>
                <th className="text-left font-medium text-muted-foreground py-2 px-4 w-[18%]">Ruolo</th>
                <th className="text-left font-medium text-muted-foreground py-2 px-4 w-[22%]">Persona Assegnata</th>
                <th className="text-left font-medium text-muted-foreground py-2 px-4 w-[18%]">Job Title</th>
                <th className="text-right font-medium text-muted-foreground py-2 px-4 w-[24%]">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const assignedUser = userByRoleId.get(row.role.id) ?? null;
                const area = row.role.functional_area_id ? areaMap.get(row.role.functional_area_id) : null;

                return (
                  <tr key={row.role.id} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                    {/* Area */}
                    <td className="py-2 px-4 align-middle">
                      {row.showArea ? (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-[0.9rem]">{row.areaName}</span>
                          {area && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="rounded p-0.5 hover:bg-muted"
                                onClick={() => openEditArea(area)}
                                title="Modifica area"
                              >
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <button
                                type="button"
                                className="rounded p-0.5 hover:bg-destructive/10"
                                onClick={() => handleDeleteArea(area)}
                                title="Elimina area"
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </td>

                    {/* Role */}
                    <td className="py-2 px-4 align-middle">
                      <div className="flex items-center gap-1.5 group">
                        <span className="font-medium text-foreground">{row.role.name}</span>
                        <button
                            type="button"
                            className="rounded p-0.5 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => openEditRole(row.role)}
                            title="Modifica ruolo"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                      </div>
                    </td>

                    {/* Persona Assegnata */}
                    <td className="py-2 px-4 align-middle">
                      {assignedUser ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-foreground">{assignedUser.full_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                    </td>

                    {/* Job Title */}
                    <td className="py-2 px-4 align-middle">
                      {assignedUser?.job_title ? (
                        <span className="text-muted-foreground">{assignedUser.job_title}</span>
                      ) : (
                        <span className="text-muted-foreground">&mdash;</span>
                      )}
                    </td>

                    {/* Azioni */}
                    <td className="py-2 px-4 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {/* Assign / reassign dropdown */}
                        <Select
                          value=""
                          onValueChange={(val) => {
                            if (val && val !== "__cancel__") {
                              handleAssign(row.role.id, val);
                            }
                          }}
                        >
                          <SelectTrigger className="w-40 h-7 text-xs">
                            <SelectValue placeholder={assignedUser ? "Riassegna..." : "Assegna..."} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__cancel__">Annulla</SelectItem>
                            {users
                              .filter((u) => !u.board_role_id || u.id === assignedUser?.id)
                              .filter((u) => u.id !== assignedUser?.id)
                              .map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.full_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>

                        {/* Edit role */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditRole(row.role)}
                          title="Modifica ruolo"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        {/* Unassign */}
                        {assignedUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-700"
                            onClick={() => handleUnassign(assignedUser.id)}
                            title="Rimuovi assegnazione"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Delete role */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDeleteRole(row.role)}
                          title="Elimina ruolo"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Persone senza ruolo */}
      {unassignedUsers.length > 0 && (
        <div className="rounded-md border border-border p-6">
          <h2 className="text-sm font-bold text-foreground mb-2">Persone senza ruolo</h2>
          <div className="flex items-center flex-wrap gap-2">
            {unassignedUsers.map((u) => (
              <Badge key={u.id} variant="secondary" className="inline-flex items-center gap-2 text-xs">
                <span>{u.full_name}</span>
                <Select
                  onValueChange={(val) => {
                    if (val && val !== "__none__") {
                      handleAssign(val, u.id);
                    }
                  }}
                >
                  <SelectTrigger className="h-5 w-28 text-xs border-0 bg-transparent p-0 shadow-none">
                    <SelectValue placeholder="Assegna..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessun ruolo</SelectItem>
                    {roles
                      .filter((r) => !userByRoleId.has(r.id))
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* ── Area Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={areaDialogOpen} onOpenChange={setAreaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingArea ? "Modifica Area Funzionale" : "Nuova Area Funzionale"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="area-name">Nome</Label>
              <Input
                id="area-name"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="es. Marketing, Finanza..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area-desc">Descrizione</Label>
              <Textarea
                id="area-desc"
                value={areaDescription}
                onChange={(e) => setAreaDescription(e.target.value)}
                placeholder="Descrizione opzionale dell'area..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAreaDialogOpen(false)}
              className="flex items-center justify-center gap-2"
            >
              Annulla
            </Button>
            <Button
              onClick={() => saveAreaMutation.mutate()}
              disabled={!areaName.trim() || saveAreaMutation.isPending}
              className="flex items-center justify-center gap-2"
            >
              {saveAreaMutation.isPending ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Role Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRole ? "Modifica Ruolo" : "Nuovo Ruolo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Nome</Label>
              <Input
                id="role-name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="es. Direttore Marketing..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-area">Area Funzionale <span className="text-destructive">*</span></Label>
              <Select value={roleAreaId} onValueChange={setRoleAreaId}>
                <SelectTrigger id="role-area">
                  <SelectValue placeholder="Seleziona area (obbligatoria)..." />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Descrizione</Label>
              <Textarea
                id="role-desc"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                placeholder="Descrizione opzionale del ruolo..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleDialogOpen(false)}
              className="flex items-center justify-center gap-2"
            >
              Annulla
            </Button>
            <Button
              onClick={() => saveRoleMutation.mutate()}
              disabled={!roleName.trim() || !roleAreaId || saveRoleMutation.isPending}
              className="flex items-center justify-center gap-2"
            >
              {saveRoleMutation.isPending ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Role Confirmation ───────────────────────────────────────── */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conferma eliminazione</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            Sei sicuro di voler eliminare il ruolo{" "}
            <span className="font-semibold text-foreground">{roleToDelete?.name}</span>?
            Questa azione non può essere annullata.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="flex items-center justify-center gap-2"
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={() => roleToDelete && deleteRoleMutation.mutate(roleToDelete.id)}
              disabled={deleteRoleMutation.isPending}
              className="flex items-center justify-center gap-2"
            >
              {deleteRoleMutation.isPending ? "Eliminazione..." : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Area Confirmation ───────────────────────────────────────── */}
      <AlertDialog open={areaDeleteConfirmOpen} onOpenChange={setAreaDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Eliminare l'area "{areaToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {areaKpiCount > 0
                ? `Questa area ha ${areaKpiCount} KPI assegnate. Eliminando l'area, le KPI rimarranno senza area. Continuare?`
                : "Questa azione è irreversibile. L'area funzionale verrà eliminata definitivamente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => areaToDelete && deleteAreaMutation.mutate(areaToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAreaMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
