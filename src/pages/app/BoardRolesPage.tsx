import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  X,
  UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

// ─── Role Row ───────────────────────────────────────────────────────────────

function RoleRow({
  role,
  assignedUser,
  allUsers,
  onAssign,
  onUnassign,
  onEdit,
  onDelete,
}: {
  role: BoardRole;
  assignedUser: TenantUser | null;
  allUsers: TenantUser[];
  onAssign: (roleId: string, userId: string) => void;
  onUnassign: (userId: string) => void;
  onEdit: (role: BoardRole) => void;
  onDelete: (role: BoardRole) => void;
}) {
  const [assigning, setAssigning] = useState(false);

  return (
    <div className="flex items-center py-3 border-b last:border-b-0 gap-3">
      {/* Role info */}
      <div className="flex items-center flex-1 min-w-0 gap-3">
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
          {role.name}
        </span>
        {role.description && (
          <span className="text-sm text-muted-foreground truncate max-w-[240px]">
            {role.description}
          </span>
        )}
      </div>

      {/* Assignment */}
      <div className="flex items-center gap-2 shrink-0">
        {assignedUser ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="inline-flex items-center gap-1 text-xs">
              <span>{assignedUser.full_name}</span>
              {assignedUser.job_title && (
                <span className="text-muted-foreground">
                  &middot; {assignedUser.job_title}
                </span>
              )}
            </Badge>
            <button
              type="button"
              className="rounded-full p-0.5 hover:bg-muted"
              onClick={() => onUnassign(assignedUser.id)}
              title="Rimuovi assegnazione"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        ) : assigning ? (
          <Select
            onValueChange={(val) => {
              if (val && val !== "__cancel__") {
                onAssign(role.id, val);
              }
              setAssigning(false);
            }}
          >
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="Seleziona persona..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__cancel__">Annulla</SelectItem>
              {allUsers
                .filter((u) => !u.board_role_id)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm italic text-muted-foreground">(non assegnato)</span>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 h-7 px-2 text-xs"
              onClick={() => setAssigning(true)}
            >
              <UserPlus className="h-3 w-3" />
              Assegna
            </Button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(role)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-red-600 hover:text-red-700"
          onClick={() => onDelete(role)}
          disabled={!!assignedUser}
          title={assignedUser ? "Rimuovi prima l'assegnazione" : "Elimina ruolo"}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── Area Card ──────────────────────────────────────────────────────────────

function AreaCard({
  area,
  roles,
  userByRoleId,
  allUsers,
  onAssign,
  onUnassign,
  onEditRole,
  onDeleteRole,
  onEditArea,
  onDeleteArea,
}: {
  area: { id: string | null; name: string; description: string | null };
  roles: BoardRole[];
  userByRoleId: Map<string, TenantUser>;
  allUsers: TenantUser[];
  onAssign: (roleId: string, userId: string) => void;
  onUnassign: (userId: string) => void;
  onEditRole: (role: BoardRole) => void;
  onDeleteRole: (role: BoardRole) => void;
  onEditArea?: (area: FunctionalArea) => void;
  onDeleteArea?: (areaId: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="border border-border">
        <CardHeader className="p-6">
          <CollapsibleTrigger asChild>
            <div className="flex items-center cursor-pointer select-none gap-3">
              <div className="flex items-center shrink-0">
                {open ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center flex-1 min-w-0 gap-3">
                <span className="text-base font-bold text-foreground">{area.name}</span>
                {area.description && (
                  <span className="text-sm text-muted-foreground truncate">
                    {area.description}
                  </span>
                )}
                <Badge variant="secondary" className="inline-flex items-center text-xs shrink-0">
                  {roles.length} {roles.length === 1 ? "ruolo" : "ruoli"}
                </Badge>
              </div>
              {area.id && onEditArea && onDeleteArea && (
                <div
                  className="flex items-center gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onEditArea(area as FunctionalArea)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600 hover:text-red-700"
                    onClick={() => onDeleteArea(area.id!)}
                    disabled={roles.length > 0}
                    title={roles.length > 0 ? "Rimuovi prima i ruoli" : "Elimina area"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="p-6 pt-0">
            {roles.length === 0 ? (
              <p className="text-sm italic text-muted-foreground py-2">
                Nessun ruolo in quest'area
              </p>
            ) : (
              <div>
                {roles.map((role) => (
                  <RoleRow
                    key={role.id}
                    role={role}
                    assignedUser={userByRoleId.get(role.id) ?? null}
                    allUsers={allUsers}
                    onAssign={onAssign}
                    onUnassign={onUnassign}
                    onEdit={onEditRole}
                    onDelete={onDeleteRole}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

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

  const userByRoleId = useMemo(() => {
    const map = new Map<string, TenantUser>();
    for (const u of users) {
      if (u.board_role_id) {
        map.set(u.board_role_id, u);
      }
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
      setAreaDialogOpen(false);
      toast({ title: editingArea ? "Area aggiornata" : "Area creata" });
    },
    onError: (err: any) => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-areas"] });
      toast({ title: "Area eliminata" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const saveRoleMutation = useMutation({
    mutationFn: async () => {
      const areaId = roleAreaId && roleAreaId !== "__none__" ? roleAreaId : null;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-roles"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-users"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-users"] });
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
    setRoleAreaId(role.functional_area_id ?? "__none__");
    setRoleDescription(role.description ?? "");
    setRoleDialogOpen(true);
  };

  const handleDeleteRole = (role: BoardRole) => {
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Organigramma</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Struttura organizzativa e ruoli
          </p>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  const noAreas = areas.length === 0;
  const noRoles = roles.length === 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Organigramma</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Struttura organizzativa e ruoli
          </p>
        </div>
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

      {/* Empty state */}
      {noAreas && noRoles && (
        <Card className="border border-border">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground text-center py-8">
              Nessuna area creata. Inizia configurando le aree funzionali.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Area cards */}
      {areas.map((area) => {
        const areaRoles = rolesByArea.get(area.id) ?? [];
        return (
          <AreaCard
            key={area.id}
            area={area}
            roles={areaRoles}
            userByRoleId={userByRoleId}
            allUsers={users}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            onEditRole={openEditRole}
            onDeleteRole={handleDeleteRole}
            onEditArea={openEditArea}
            onDeleteArea={(id) => deleteAreaMutation.mutate(id)}
          />
        );
      })}

      {/* Senza Area section */}
      {(rolesByArea.get(null) ?? []).length > 0 && (
        <AreaCard
          area={{ id: null, name: "Senza Area", description: "Ruoli non assegnati a nessuna area funzionale" }}
          roles={rolesByArea.get(null) ?? []}
          userByRoleId={userByRoleId}
          allUsers={users}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onEditRole={openEditRole}
          onDeleteRole={handleDeleteRole}
        />
      )}

      {/* Persone senza ruolo */}
      {unassignedUsers.length > 0 && (
        <Card className="border border-border">
          <CardHeader className="p-6">
            <span className="text-base font-bold text-foreground">
              Persone senza ruolo
            </span>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <div className="space-y-2">
              {unassignedUsers.map((u) => (
                <div key={u.id} className="flex items-center py-2 gap-3">
                  <span className="text-sm text-foreground flex-1">{u.full_name}</span>
                  <Select
                    onValueChange={(val) => {
                      if (val && val !== "__none__") {
                        handleAssign(val, u.id);
                      }
                    }}
                  >
                    <SelectTrigger className="w-52 h-8 text-sm">
                      <SelectValue placeholder="Assegna ruolo..." />
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
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
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
              <Label htmlFor="role-area">Area Funzionale</Label>
              <Select value={roleAreaId} onValueChange={setRoleAreaId}>
                <SelectTrigger id="role-area">
                  <SelectValue placeholder="Seleziona area..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna area</SelectItem>
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
              disabled={!roleName.trim() || saveRoleMutation.isPending}
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
    </div>
  );
}
