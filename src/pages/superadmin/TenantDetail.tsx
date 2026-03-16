import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Users,
  CalendarDays,
  BarChart3,
  UserPlus,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */
const roleLabels: Record<string, string> = {
  org_admin: "Admin",
  information_officer: "Info Officer",
  dirigente: "Dirigente",
};
const roleBadge: Record<string, { variant: "default" | "secondary" | "outline" }> = {
  org_admin: { variant: "default" },
  information_officer: { variant: "outline" },
  dirigente: { variant: "secondary" },
};
const planBadge: Record<string, { variant: "default" | "secondary" | "outline"; className?: string }> = {
  free: { variant: "secondary" },
  pro: { variant: "default", className: "bg-blue-600 hover:bg-blue-700" },
  enterprise: { variant: "default", className: "bg-foreground hover:bg-foreground/90" },
};
const meetingStatusLabels: Record<string, string> = {
  draft: "Bozza",
  pre_meeting: "Pre-Meeting",
  in_progress: "In Corso",
  completed: "Completata",
};
const meetingStatusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pre_meeting: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

type TenantUser = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  job_title: string | null;
  is_active: boolean;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/*  Invite User Dialog                                                 */
/* ------------------------------------------------------------------ */
function InviteUserDialog({ open, onOpenChange, tenantId }: { open: boolean; onOpenChange: (v: boolean) => void; tenantId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [role, setRole] = useState("dirigente");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("users").insert({
        id: crypto.randomUUID(),
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        job_title: jobTitle.trim() || null,
        role,
        tenant_id: tenantId,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sa-tenant-users", tenantId] });
      onOpenChange(false);
      setEmail(""); setFullName(""); setJobTitle(""); setRole("dirigente");
      toast({ title: "Utente invitato con successo" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invita Utente nel Tenant</DialogTitle>
          <DialogDescription>L'utente potrà accedere tramite Magic Link.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="email@esempio.it" />
          </div>
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Mario Rossi" />
          </div>
          <div className="space-y-2">
            <Label>Job Title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required placeholder="Direttore Commerciale" />
          </div>
          <div className="space-y-2">
            <Label>Ruolo</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Admin</SelectItem>
                <SelectItem value="dirigente">Dirigente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={mutation.isPending || !email.trim() || !fullName.trim()}>
              {mutation.isPending ? "Invio…" : "Invita"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit User Dialog                                                   */
/* ------------------------------------------------------------------ */
function EditUserDialog({ open, onOpenChange, user, tenantId }: { open: boolean; onOpenChange: (v: boolean) => void; user: TenantUser | null; tenantId: string }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [role, setRole] = useState("dirigente");
  const [isActive, setIsActive] = useState(true);

  useState(() => {
    if (user) {
      setFullName(user.full_name);
      setJobTitle(user.job_title ?? "");
      setRole(user.role);
      setIsActive(user.is_active);
    }
  });

  // Sync when user changes
  useMemo(() => {
    if (user && open) {
      setFullName(user.full_name);
      setJobTitle(user.job_title ?? "");
      setRole(user.role);
      setIsActive(user.is_active);
    }
  }, [user, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("users").update({
        full_name: fullName.trim(),
        job_title: jobTitle.trim() || null,
        role,
        is_active: isActive,
      }).eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sa-tenant-users", tenantId] });
      onOpenChange(false);
      toast({ title: "Utente aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifica Utente</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Job Title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ruolo</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="org_admin">Admin</SelectItem>
                <SelectItem value="dirigente">Dirigente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Label>Attivo</Label>
            <Button type="button" variant={isActive ? "default" : "outline"} size="sm" onClick={() => setIsActive(!isActive)}>
              {isActive ? <><Check className="h-3 w-3 mr-1" />Attivo</> : <><X className="h-3 w-3 mr-1" />Disattivato</>}
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvataggio…" : "Salva"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit Tenant Dialog (inline)                                        */
/* ------------------------------------------------------------------ */
function EditTenantDialog({ open, onOpenChange, tenant }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenant: { id: string; name: string; slug: string; plan: string; vat_number: string } | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("free");
  const [vatNumber, setVatNumber] = useState("");

  useMemo(() => {
    if (tenant && open) {
      setName(tenant.name);
      setSlug(tenant.slug);
      setPlan(tenant.plan);
      setVatNumber(tenant.vat_number);
    }
  }, [tenant, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenant) return;
      const { error } = await supabase.from("tenants").update({
        name: name.trim(),
        slug: slug.trim(),
        plan,
        vat_number: vatNumber.trim(),
      }).eq("id", tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sa-tenant-detail"] });
      onOpenChange(false);
      toast({ title: "Tenant aggiornato" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifica Tenant</DialogTitle>
          <DialogDescription>Aggiorna i dati del tenant.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="space-y-2"><Label>P.IVA</Label><Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} required /></div>
          <div className="space-y-2"><Label>Slug</Label><Input value={slug} onChange={(e) => setSlug(e.target.value)} required className="font-mono text-sm" /></div>
          <div className="space-y-2">
            <Label>Piano</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Salvataggio…" : "Salva"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Users Tab                                                          */
/* ------------------------------------------------------------------ */
function UsersTab({ tenantId }: { tenantId: string }) {
  const { data: users, isLoading } = useQuery({
    queryKey: ["sa-tenant-users", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, full_name, email, role, job_title, is_active, created_at")
        .eq("tenant_id", tenantId)
        .order("full_name");
      if (error) throw error;
      return data as TenantUser[];
    },
  });

  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUser, setEditUser] = useState<TenantUser | null>(null);
  const [roleChange, setRoleChange] = useState<{ user: TenantUser; newRole: string } | null>(null);

  const toggleActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await supabase.from("users").update({ is_active: active }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sa-tenant-users", tenantId] });
      toast({ title: "Stato aggiornato" });
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = await supabase.from("users").update({ role }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sa-tenant-users", tenantId] });
      setRoleChange(null);
      toast({ title: "Ruolo aggiornato" });
    },
  });

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setInviteOpen(true)} size="sm">
          <UserPlus className="h-4 w-4 mr-2" />Invita Utente
        </Button>
      </div>

      {!users?.length ? (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nessun utente in questo tenant</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Attivo</TableHead>
                <TableHead>Creato il</TableHead>
                <TableHead className="w-[140px]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const rb = roleBadge[u.role] ?? roleBadge.dirigente;
                return (
                  <TableRow key={u.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{u.full_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(newRole) => {
                          if (newRole !== u.role) setRoleChange({ user: u, newRole });
                        }}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                          <Badge variant={rb.variant} className="text-[10px]">{roleLabels[u.role] ?? u.role}</Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="org_admin">Admin</SelectItem>
                          <SelectItem value="dirigente">Dirigente</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.job_title ?? "—"}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => toggleActive.mutate({ userId: u.id, active: !u.is_active })}
                        className="flex items-center gap-1.5"
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${u.is_active ? "bg-green-500" : "bg-red-400"}`} />
                        <span className="text-xs text-muted-foreground">{u.is_active ? "Sì" : "No"}</span>
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditUser(u)} title="Modifica">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} tenantId={tenantId} />
      <EditUserDialog open={!!editUser} onOpenChange={(v) => { if (!v) setEditUser(null); }} user={editUser} tenantId={tenantId} />

      {/* Role change confirmation */}
      <AlertDialog open={!!roleChange} onOpenChange={(v) => { if (!v) setRoleChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma cambio ruolo</AlertDialogTitle>
            <AlertDialogDescription>
              Cambiare il ruolo di <strong>{roleChange?.user.full_name}</strong> da{" "}
              <strong>{roleLabels[roleChange?.user.role ?? ""]}</strong> a{" "}
              <strong>{roleLabels[roleChange?.newRole ?? ""]}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (roleChange) changeRole.mutate({ userId: roleChange.user.id, role: roleChange.newRole });
            }}>
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Meetings Tab                                                       */
/* ------------------------------------------------------------------ */
function MeetingsTab({ tenantId }: { tenantId: string }) {
  const { data: meetings, isLoading } = useQuery({
    queryKey: ["sa-tenant-meetings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title, scheduled_date, quarter, status")
        .eq("tenant_id", tenantId)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  if (!meetings?.length) return (
    <div className="text-center py-12 border border-dashed border-border rounded-lg">
      <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">Nessuna riunione</p>
    </div>
  );

  return (
    <div className="border border-border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Titolo</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Trimestre</TableHead>
            <TableHead>Stato</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.map((m) => (
            <TableRow key={m.id} className="hover:bg-muted/30">
              <TableCell className="font-medium">{m.title}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(m.scheduled_date).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
              </TableCell>
              <TableCell className="text-sm font-mono">{m.quarter}</TableCell>
              <TableCell>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meetingStatusColors[m.status] ?? "bg-muted text-muted-foreground"}`}>
                  {meetingStatusLabels[m.status] ?? m.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats Tab                                                          */
/* ------------------------------------------------------------------ */
function StatsTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["sa-tenant-stats", tenantId],
    queryFn: async () => {
      const [usersRes, meetingsRes, tasksRes, doneTasksRes, lastAudit] = await Promise.all([
        supabase.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
        supabase.from("meetings").select("id, scheduled_date").eq("tenant_id", tenantId).order("scheduled_date", { ascending: false }),
        supabase.from("board_tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("board_tasks").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "done"),
        supabase.from("audit_logs").select("created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1),
      ]);

      // Meetings per month (last 6)
      const meetings = meetingsRes.data ?? [];
      const now = new Date();
      const monthlyMeetings: { month: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
        const start = d.toISOString().split("T")[0];
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
        const count = meetings.filter((m) => m.scheduled_date >= start && m.scheduled_date <= end).length;
        monthlyMeetings.push({ month: key, count });
      }

      const totalTasks = tasksRes.count ?? 0;
      const doneTasks = doneTasksRes.count ?? 0;

      return {
        userCount: usersRes.count ?? 0,
        meetingCount: meetings.length,
        lastActivity: lastAudit.data?.[0]?.created_at ?? null,
        taskCompletion: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
        totalTasks,
        doneTasks,
        monthlyMeetings,
      };
    },
  });

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!data) return null;

  const maxCount = Math.max(...data.monthlyMeetings.map((m) => m.count), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Utenti Attivi</p>
          <p className="text-2xl font-semibold font-mono mt-1">{data.userCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Riunioni Totali</p>
          <p className="text-2xl font-semibold font-mono mt-1">{data.meetingCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Ultimo Accesso</p>
          <p className="text-sm font-medium mt-1">
            {data.lastActivity
              ? new Date(data.lastActivity).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : "Nessuno"}
          </p>
        </CardContent></Card>
      </div>

      {/* Task completion */}
      <Card><CardContent className="p-6 space-y-3">
        <p className="text-sm font-medium text-foreground">Completamento Task</p>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${data.taskCompletion}%` }} />
          </div>
          <span className="text-sm font-mono font-semibold">{data.taskCompletion}%</span>
        </div>
        <p className="text-xs text-muted-foreground">{data.doneTasks} completati su {data.totalTasks} totali</p>
      </CardContent></Card>

      {/* Monthly meetings bar chart */}
      <Card><CardContent className="p-6 space-y-4">
        <p className="text-sm font-medium text-foreground">Riunioni per Mese (ultimi 6 mesi)</p>
        <div className="flex items-end gap-3 h-32">
          {data.monthlyMeetings.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-mono font-semibold">{m.count}</span>
              <div
                className="w-full bg-foreground rounded-sm transition-all"
                style={{ height: `${Math.max((m.count / maxCount) * 100, 4)}%` }}
              />
              <span className="text-[10px] text-muted-foreground">{m.month}</span>
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function TenantDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["sa-tenant-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, vat_number, logo_url, created_at")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!tenant) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Tenant non trovato</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/superadmin/tenants")}>Torna alla lista</Button>
    </div>
  );

  const pb = planBadge[tenant.plan] ?? planBadge.free;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/superadmin/tenants")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {tenant.logo_url && (
              <img src={tenant.logo_url} alt="" className="h-8 w-8 rounded object-cover" />
            )}
            <h1 className="text-2xl font-semibold text-foreground">{tenant.name}</h1>
            <Badge variant={pb.variant} className={pb.className}>{tenant.plan}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Creato il {new Date(tenant.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })}
            {" · "}P.IVA: {tenant.vat_number || "—"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-3.5 w-3.5 mr-2" />Modifica
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" />Utenti</TabsTrigger>
          <TabsTrigger value="meetings" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Riunioni</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Statistiche</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-6">
          <UsersTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="meetings" className="mt-6">
          <MeetingsTab tenantId={tenant.id} />
        </TabsContent>
        <TabsContent value="stats" className="mt-6">
          <StatsTab tenantId={tenant.id} />
        </TabsContent>
      </Tabs>

      <EditTenantDialog open={editOpen} onOpenChange={setEditOpen} tenant={tenant} />
    </div>
  );
}
