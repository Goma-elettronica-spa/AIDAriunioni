import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserPlus, Pencil, Power, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  job_title: string | null;
  is_active: boolean;
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

export default function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;

  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const filtered = useMemo(() => {
    if (!users.data) return [];
    return users.data.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      return true;
    });
  }, [users.data, roleFilter, statusFilter]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  // Approve join request
  const approveMutation = useMutation({
    mutationFn: async (request: JoinRequest) => {
      // 1. Update join_request status to approved
      const { error: updateError } = await supabase
        .from("join_requests")
        .update({ status: "approved" })
        .eq("id", request.id);
      if (updateError) throw updateError;

      // 2. Create user record in users table
      const { error: userError } = await supabase.from("users").insert({
        id: request.user_id,
        email: request.email,
        full_name: request.full_name,
        role: "dirigente",
        tenant_id: tenantId!,
      });
      if (userError) throw userError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["team-users"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["join-requests"] });
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
      <div className="flex flex-wrap gap-3">
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
      </div>

      {/* Table */}
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
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead className="hidden md:table-cell">Job Title</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-24">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const rc = roleConfig[u.role] ?? {
                  label: u.role,
                  variant: "secondary" as const,
                };
                return (
                  <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rc.variant} className="text-xs">
                        {rc.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {u.job_title ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <StatusDot active={u.is_active} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
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
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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
    </div>
  );
}
