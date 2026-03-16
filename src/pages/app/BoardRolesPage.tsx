import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Users,
  UserCog,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Manual types for tables not yet in generated types
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
  email: string;
  role: string;
  board_role_id: string | null;
  functional_area_id: string | null;
};

// ─── Functional Areas Section ────────────────────────────────────────────────

function FunctionalAreasSection({
  tenantId,
  areas,
  areasLoading,
  rolesData,
}: {
  tenantId: string;
  areas: FunctionalArea[];
  areasLoading: boolean;
  rolesData: BoardRole[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<FunctionalArea | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const openCreate = () => {
    setEditingArea(null);
    setName("");
    setDescription("");
    setDialogOpen(true);
  };

  const openEdit = (area: FunctionalArea) => {
    setEditingArea(area);
    setName(area.name);
    setDescription(area.description ?? "");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingArea) {
        const { error } = await (supabase.from as any)("functional_areas")
          .update({ name, description: description || null })
          .eq("id", editingArea.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("functional_areas")
          .insert({ tenant_id: tenantId, name, description: description || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-areas"] });
      setDialogOpen(false);
      toast({ title: editingArea ? "Area aggiornata" : "Area creata" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
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

  const roleCountByArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const role of rolesData) {
      if (role.functional_area_id) {
        map.set(role.functional_area_id, (map.get(role.functional_area_id) ?? 0) + 1);
      }
    }
    return map;
  }, [rolesData]);

  return (
    <Card className="border border-border">
      <CardHeader className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg font-semibold">Aree Funzionali</CardTitle>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            Nuova Area
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        {areasLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : areas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessuna area funzionale definita
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-3 px-4">Nome</TableHead>
                  <TableHead className="py-3 px-4">Descrizione</TableHead>
                  <TableHead className="py-3 px-4 text-center">N. Ruoli</TableHead>
                  <TableHead className="py-3 px-4 text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="py-3 px-4">
                      <span className="text-sm font-medium text-foreground">{area.name}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">
                        {area.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-center">
                      <Badge variant="secondary" className="inline-flex items-center text-xs">
                        {roleCountByArea.get(area.id) ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(area)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                          onClick={() => deleteMutation.mutate(area.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="es. Marketing, Finanza..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area-desc">Descrizione</Label>
                <Textarea
                  id="area-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrizione opzionale dell'area..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="flex items-center justify-center gap-2"
              >
                Annulla
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                className="flex items-center justify-center gap-2"
              >
                {saveMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Board Roles Section ─────────────────────────────────────────────────────

function BoardRolesSection({
  tenantId,
  roles,
  rolesLoading,
  areas,
}: {
  tenantId: string;
  roles: BoardRole[];
  rolesLoading: boolean;
  areas: FunctionalArea[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<BoardRole | null>(null);
  const [name, setName] = useState("");
  const [functionalAreaId, setFunctionalAreaId] = useState<string>("");
  const [description, setDescription] = useState("");

  const areaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of areas) map.set(a.id, a.name);
    return map;
  }, [areas]);

  const openCreate = () => {
    setEditingRole(null);
    setName("");
    setFunctionalAreaId("");
    setDescription("");
    setDialogOpen(true);
  };

  const openEdit = (role: BoardRole) => {
    setEditingRole(role);
    setName(role.name);
    setFunctionalAreaId(role.functional_area_id ?? "");
    setDescription(role.description ?? "");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingRole) {
        const { error } = await (supabase.from as any)("board_roles")
          .update({
            name,
            functional_area_id: functionalAreaId || null,
            description: description || null,
          })
          .eq("id", editingRole.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("board_roles")
          .insert({
            tenant_id: tenantId,
            name,
            functional_area_id: functionalAreaId || null,
            description: description || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-roles"] });
      setDialogOpen(false);
      toast({ title: editingRole ? "Ruolo aggiornato" : "Ruolo creato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("board_roles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-roles"] });
      toast({ title: "Ruolo eliminato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="border border-border">
      <CardHeader className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-muted">
              <UserCog className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg font-semibold">Ruoli Board</CardTitle>
          </div>
          <Button size="sm" onClick={openCreate} className="flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />
            Nuovo Ruolo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        {rolesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessun ruolo board definito
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-3 px-4">Nome Ruolo</TableHead>
                  <TableHead className="py-3 px-4">Area Funzionale</TableHead>
                  <TableHead className="py-3 px-4">Descrizione</TableHead>
                  <TableHead className="py-3 px-4 text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="py-3 px-4">
                      <span className="text-sm font-medium text-foreground">{role.name}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      {role.functional_area_id ? (
                        <Badge variant="secondary" className="inline-flex items-center text-xs">
                          {areaMap.get(role.functional_area_id) ?? "—"}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">
                        {role.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(role)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                          onClick={() => deleteMutation.mutate(role.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingRole ? "Modifica Ruolo Board" : "Nuovo Ruolo Board"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="role-name">Nome</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="es. Direttore Marketing..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-area">Area Funzionale</Label>
                <Select value={functionalAreaId} onValueChange={setFunctionalAreaId}>
                  <SelectTrigger id="role-area">
                    <SelectValue placeholder="Seleziona area..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuna</SelectItem>
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
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrizione opzionale del ruolo..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="flex items-center justify-center gap-2"
              >
                Annulla
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                className="flex items-center justify-center gap-2"
              >
                {saveMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── User Assignment Section ─────────────────────────────────────────────────

function UserAssignmentSection({
  tenantId,
  areas,
  roles,
}: {
  tenantId: string;
  areas: FunctionalArea[];
  roles: BoardRole[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["board-roles-users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, role")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;

      // Also fetch board_role_id and functional_area_id via a separate query
      // since these columns may not be in generated types
      const userIds = (data ?? []).map((u) => u.id);
      if (userIds.length === 0) return [];

      const { data: extData } = await (supabase.from as any)("users")
        .select("id, board_role_id, functional_area_id")
        .in("id", userIds);

      const extMap = new Map<string, { board_role_id: string | null; functional_area_id: string | null }>();
      for (const row of extData ?? []) {
        extMap.set(row.id, {
          board_role_id: row.board_role_id ?? null,
          functional_area_id: row.functional_area_id ?? null,
        });
      }

      return (data ?? []).map((u) => ({
        ...u,
        board_role_id: extMap.get(u.id)?.board_role_id ?? null,
        functional_area_id: extMap.get(u.id)?.functional_area_id ?? null,
      })) as TenantUser[];
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({
      userId,
      field,
      value,
    }: {
      userId: string;
      field: "board_role_id" | "functional_area_id";
      value: string | null;
    }) => {
      const { error } = await (supabase.from as any)("users")
        .update({ [field]: value })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-roles-users"] });
      toast({ title: "Assegnazione aggiornata" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of roles) map.set(r.id, r.name);
    return map;
  }, [roles]);

  const areaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of areas) map.set(a.id, a.name);
    return map;
  }, [areas]);

  return (
    <Card className="border border-border">
      <CardHeader className="p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-muted">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <CardTitle className="text-lg font-semibold">Assegnazione Utenti</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-6 pt-0">
        {usersQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !usersQuery.data?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessun utente nel tenant
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="py-3 px-4">Nome</TableHead>
                  <TableHead className="py-3 px-4">Email</TableHead>
                  <TableHead className="py-3 px-4">Ruolo Board</TableHead>
                  <TableHead className="py-3 px-4">Area Funzionale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="py-3 px-4">
                      <span className="text-sm font-medium text-foreground">{u.full_name}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">{u.email}</span>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Select
                        value={u.board_role_id ?? "__none__"}
                        onValueChange={(val) =>
                          updateUserMutation.mutate({
                            userId: u.id,
                            field: "board_role_id",
                            value: val === "__none__" ? null : val,
                          })
                        }
                      >
                        <SelectTrigger className="w-48 h-8 text-sm">
                          <SelectValue>
                            {u.board_role_id
                              ? roleMap.get(u.board_role_id) ?? "—"
                              : <span className="text-muted-foreground">Non assegnato</span>}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Non assegnato</SelectItem>
                          {roles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-3 px-4">
                      <Select
                        value={u.functional_area_id ?? "__none__"}
                        onValueChange={(val) =>
                          updateUserMutation.mutate({
                            userId: u.id,
                            field: "functional_area_id",
                            value: val === "__none__" ? null : val,
                          })
                        }
                      >
                        <SelectTrigger className="w-48 h-8 text-sm">
                          <SelectValue>
                            {u.functional_area_id
                              ? areaMap.get(u.functional_area_id) ?? "—"
                              : <span className="text-muted-foreground">Non assegnato</span>}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Non assegnato</SelectItem>
                          {areas.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BoardRolesPage() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

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

  return (
    <div className="space-y-section-gap">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Organigramma</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestisci aree funzionali, ruoli board e assegnazioni utenti
        </p>
      </div>

      <Tabs defaultValue="areas" className="w-full">
        <TabsList className="inline-flex items-center gap-1">
          <TabsTrigger value="areas" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Aree Funzionali
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Ruoli Board
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Assegnazioni
          </TabsTrigger>
        </TabsList>

        <TabsContent value="areas" className="mt-6">
          <FunctionalAreasSection
            tenantId={tenantId!}
            areas={areasQuery.data ?? []}
            areasLoading={areasQuery.isLoading}
            rolesData={rolesQuery.data ?? []}
          />
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <BoardRolesSection
            tenantId={tenantId!}
            roles={rolesQuery.data ?? []}
            rolesLoading={rolesQuery.isLoading}
            areas={areasQuery.data ?? []}
          />
        </TabsContent>

        <TabsContent value="assignments" className="mt-6">
          <UserAssignmentSection
            tenantId={tenantId!}
            areas={areasQuery.data ?? []}
            roles={rolesQuery.data ?? []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
