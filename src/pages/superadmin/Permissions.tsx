import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useCallback } from "react";
import {
  Search,
  Check,
  Minus,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ------------------------------------------------------------------ */
/*  Permissions Matrix (hardcoded)                                     */
/* ------------------------------------------------------------------ */
const roles = ["Superadmin", "Org Admin", "Info Officer", "Dirigente"] as const;

const permissions: { feature: string; access: [boolean, boolean, boolean, boolean] }[] = [
  { feature: "Gestire Tenant", access: [true, false, false, false] },
  { feature: "Gestire Utenti (invita, modifica, disattiva)", access: [true, true, false, false] },
  { feature: "Cambiare ruoli utenti", access: [true, true, false, false] },
  { feature: "Creare Riunioni", access: [true, true, false, false] },
  { feature: "Cambiare stato riunione", access: [true, true, false, false] },
  { feature: "Compilare Pre-Meeting (propri dati)", access: [false, false, false, true] },
  { feature: "Modificare dati altrui", access: [true, false, true, false] },
  { feature: "Approvare Brief", access: [false, false, true, false] },
  { feature: "Vedere Audit Log", access: [true, true, true, false] },
  { feature: "Gestire KPI definitions", access: [true, true, true, false] },
  { feature: "Gestire Board Tasks (tutti)", access: [true, true, true, false] },
  { feature: "Upload Video/Trascrizione", access: [true, true, false, false] },
  { feature: "Generare Documenti AI", access: [true, true, false, false] },
  { feature: "Vedere Dashboard Superadmin", access: [true, false, false, false] },
];

function PermissionsMatrix() {
  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="min-w-[260px] sticky left-0 bg-muted/50 z-10">Funzionalità</TableHead>
            {roles.map((r) => (
              <TableHead key={r} className="text-center w-[120px]">{r}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {permissions.map((p) => (
            <TableRow key={p.feature}>
              <TableCell className="text-sm font-medium sticky left-0 bg-background z-10">{p.feature}</TableCell>
              {p.access.map((has, i) => (
                <TableCell key={i} className="text-center">
                  {has ? (
                    <Check className="h-4 w-4 text-green-600 mx-auto" />
                  ) : (
                    <Minus className="h-3 w-3 text-muted-foreground/40 mx-auto" />
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Role counts per tenant                                             */
/* ------------------------------------------------------------------ */
const roleKeys = ["org_admin", "information_officer", "dirigente"] as const;
const roleLabels: Record<string, string> = {
  org_admin: "Admin",
  information_officer: "Info Officer",
  dirigente: "Dirigente",
};

type TenantRoleSummary = {
  tenantId: string;
  tenantName: string;
  counts: Record<string, number>;
  total: number;
};

function useRoleCounts() {
  return useQuery({
    queryKey: ["sa-role-counts"],
    queryFn: async () => {
      const [tenantsRes, usersRes] = await Promise.all([
        supabase.from("tenants").select("id, name").order("name"),
        supabase.from("users").select("tenant_id, role").eq("is_active", true),
      ]);
      if (tenantsRes.error) throw tenantsRes.error;
      const tenants = tenantsRes.data ?? [];
      const users = usersRes.data ?? [];

      return tenants.map((t): TenantRoleSummary => {
        const tenantUsers = users.filter((u) => u.tenant_id === t.id);
        const counts: Record<string, number> = {};
        roleKeys.forEach((r) => {
          counts[r] = tenantUsers.filter((u) => u.role === r).length;
        });
        return { tenantId: t.id, tenantName: t.name, counts, total: tenantUsers.length };
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Users modal when clicking a count                                  */
/* ------------------------------------------------------------------ */
type FilteredUser = { id: string; full_name: string; email: string; role: string };

function UsersModal({
  open,
  onOpenChange,
  tenantName,
  roleName,
  tenantId,
  role,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantName: string;
  roleName: string;
  tenantId: string;
  role: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["sa-role-users", tenantId, role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, role")
        .eq("tenant_id", tenantId)
        .eq("role", role)
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data as FilteredUser[];
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{roleName} — {tenantName}</DialogTitle>
          <DialogDescription>{data?.length ?? 0} utenti con questo ruolo</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nessun utente</p>
        ) : (
          <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
            {data.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2.5 px-1">
                <div>
                  <p className="text-sm font-medium">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleCountsSection() {
  const { data, isLoading } = useRoleCounts();
  const [modal, setModal] = useState<{ tenantId: string; tenantName: string; role: string; roleName: string } | null>(null);

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (!data?.length) return <p className="text-sm text-muted-foreground">Nessun tenant</p>;

  return (
    <>
      <div className="border border-border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Tenant</TableHead>
              {roleKeys.map((r) => <TableHead key={r} className="text-center">{roleLabels[r]}</TableHead>)}
              <TableHead className="text-center">Totale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((t) => (
              <TableRow key={t.tenantId}>
                <TableCell className="font-medium">{t.tenantName}</TableCell>
                {roleKeys.map((r) => (
                  <TableCell key={r} className="text-center">
                    <button
                      className="font-mono text-sm hover:underline hover:text-foreground text-muted-foreground transition-colors"
                      onClick={() => setModal({ tenantId: t.tenantId, tenantName: t.tenantName, role: r, roleName: roleLabels[r] })}
                      disabled={t.counts[r] === 0}
                    >
                      {t.counts[r]}
                    </button>
                  </TableCell>
                ))}
                <TableCell className="text-center font-mono text-sm font-semibold">{t.total}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {modal && (
        <UsersModal
          open
          onOpenChange={() => setModal(null)}
          tenantName={modal.tenantName}
          roleName={modal.roleName}
          tenantId={modal.tenantId}
          role={modal.role}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick Role Change (search + bulk)                                  */
/* ------------------------------------------------------------------ */
type SearchUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  tenant_id: string | null;
  tenantName: string;
};

function QuickRoleChange() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmSingle, setConfirmSingle] = useState<{ user: SearchUser; newRole: string } | null>(null);
  const [bulkRole, setBulkRole] = useState<string | null>(null);

  const debouncedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["sa-user-search", debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < 2) return [];

      let query = supabase
        .from("users")
        .select("id, full_name, email, role, tenant_id")
        .eq("is_active", true)
        .order("full_name")
        .limit(50);

      // Search by name or email
      query = query.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch tenant names
      const tenantIds = [...new Set((data ?? []).map((u) => u.tenant_id).filter(Boolean))] as string[];
      const { data: tenants } = tenantIds.length
        ? await supabase.from("tenants").select("id, name").in("id", tenantIds)
        : { data: [] };
      const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t.name]));

      return (data ?? []).map((u): SearchUser => ({
        ...u,
        tenantName: u.tenant_id ? (tenantMap.get(u.tenant_id) ?? "—") : "Nessun tenant",
      }));
    },
    enabled: debouncedSearch.length >= 2,
  });

  const changeRoleMut = useMutation({
    mutationFn: async ({ userIds, role }: { userIds: string[]; role: string }) => {
      for (const id of userIds) {
        const { error } = await supabase.from("users").update({ role }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sa-user-search"] });
      qc.invalidateQueries({ queryKey: ["sa-role-counts"] });
      setConfirmSingle(null);
      setBulkRole(null);
      setSelected(new Set());
      toast({ title: "Ruolo aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = users?.length ? users.every((u) => selected.has(u.id)) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca utente per nome o email (min 2 caratteri)..."
            className="pl-9"
          />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{selected.size} selezionati</span>
            <Select onValueChange={(v) => setBulkRole(v)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Cambia ruolo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Admin</SelectItem>
                <SelectItem value="dirigente">Dirigente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {debouncedSearch.length < 2 ? (
        <p className="text-sm text-muted-foreground py-4">Digita almeno 2 caratteri per cercare</p>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !users?.length ? (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <Users className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nessun utente trovato</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={() => {
                      if (allSelected) setSelected(new Set());
                      else setSelected(new Set(users.map((u) => u.id)));
                    }}
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Ruolo Attuale</TableHead>
                <TableHead className="w-[140px]">Cambia Ruolo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Checkbox
                      checked={selected.has(u.id)}
                      onCheckedChange={() => toggleSelect(u.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{u.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="text-sm">{u.tenantName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{roleLabels[u.role] ?? u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.role}
                      onValueChange={(newRole) => {
                        if (newRole !== u.role) setConfirmSingle({ user: u, newRole });
                      }}
                    >
                      <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="org_admin">Admin</SelectItem>
                        <SelectItem value="dirigente">Dirigente</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Single role change confirmation */}
      <AlertDialog open={!!confirmSingle} onOpenChange={(v) => { if (!v) setConfirmSingle(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma cambio ruolo</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiare il ruolo di <strong>{confirmSingle?.user.full_name}</strong> da{" "}
              <strong>{roleLabels[confirmSingle?.user.role ?? ""]}</strong> a{" "}
              <strong>{roleLabels[confirmSingle?.newRole ?? ""]}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmSingle) changeRoleMut.mutate({ userIds: [confirmSingle.user.id], role: confirmSingle.newRole });
              }}
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk role change confirmation */}
      <AlertDialog open={!!bulkRole} onOpenChange={(v) => { if (!v) setBulkRole(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambio ruolo di massa</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiare il ruolo di <strong>{selected.size}</strong> utenti a{" "}
              <strong>{roleLabels[bulkRole ?? ""]}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (bulkRole) changeRoleMut.mutate({ userIds: [...selected], role: bulkRole });
              }}
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function PermissionsPage() {
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold text-foreground">Permessi e Ruoli</h1>

      {/* Permissions Matrix */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Matrice Permessi</h2>
        <p className="text-sm text-muted-foreground">Riferimento delle funzionalità accessibili per ciascun ruolo.</p>
        <PermissionsMatrix />
      </section>

      {/* Role Counts */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Ruoli per Tenant</h2>
        <p className="text-sm text-muted-foreground">Clicca su un numero per vedere gli utenti con quel ruolo.</p>
        <RoleCountsSection />
      </section>

      {/* Quick Role Change */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Cambio Ruolo Rapido</h2>
        <p className="text-sm text-muted-foreground">Cerca un utente e cambia il suo ruolo. Puoi selezionare più utenti per un cambio di massa.</p>
        <QuickRoleChange />
      </section>
    </div>
  );
}
