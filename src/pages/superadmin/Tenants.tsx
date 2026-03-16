import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import {
  Building2,
  Plus,
  Search,
  Pencil,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function slugify(text: string) {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}

const planBadge: Record<string, { variant: "default" | "secondary" | "outline"; className?: string }> = {
  free: { variant: "secondary" },
  pro: { variant: "default", className: "bg-blue-600 hover:bg-blue-700" },
  enterprise: { variant: "default", className: "bg-foreground hover:bg-foreground/90" },
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  vat_number: string;
  logo_url: string | null;
  created_at: string;
  userCount: number;
  meetingCount: number;
  lastMeeting: string | null;
};

type SortKey = "name" | "slug" | "plan" | "userCount" | "meetingCount" | "lastMeeting" | "created_at";

/* ------------------------------------------------------------------ */
/*  Data hook                                                          */
/* ------------------------------------------------------------------ */
function useTenantList() {
  return useQuery({
    queryKey: ["sa-tenants"],
    queryFn: async () => {
      const { data: tenants, error } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, vat_number, logo_url, created_at")
        .order("name");
      if (error) throw error;
      if (!tenants?.length) return [];

      const ids = tenants.map((t) => t.id);
      const [usersRes, meetingsRes] = await Promise.all([
        supabase.from("users").select("tenant_id").eq("is_active", true).in("tenant_id", ids),
        supabase.from("meetings").select("tenant_id, scheduled_date").in("tenant_id", ids).order("scheduled_date", { ascending: false }),
      ]);

      const userCounts = new Map<string, number>();
      (usersRes.data ?? []).forEach((u) => {
        userCounts.set(u.tenant_id!, (userCounts.get(u.tenant_id!) ?? 0) + 1);
      });

      const meetingCounts = new Map<string, number>();
      const lastMeetings = new Map<string, string>();
      (meetingsRes.data ?? []).forEach((m) => {
        meetingCounts.set(m.tenant_id, (meetingCounts.get(m.tenant_id) ?? 0) + 1);
        if (!lastMeetings.has(m.tenant_id)) lastMeetings.set(m.tenant_id, m.scheduled_date);
      });

      return tenants.map((t): TenantRow => ({
        ...t,
        userCount: userCounts.get(t.id) ?? 0,
        meetingCount: meetingCounts.get(t.id) ?? 0,
        lastMeeting: lastMeetings.get(t.id) ?? null,
      }));
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Tenant Form Dialog                                                 */
/* ------------------------------------------------------------------ */
interface TenantFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTenant?: TenantRow | null;
}

function TenantFormDialog({ open, onOpenChange, editTenant }: TenantFormProps) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [plan, setPlan] = useState("free");
  const [vatNumber, setVatNumber] = useState("");
  const [slugError, setSlugError] = useState("");

  useEffect(() => {
    if (open) {
      if (editTenant) {
        setName(editTenant.name);
        setSlug(editTenant.slug);
        setSlugManual(true);
        setPlan(editTenant.plan);
        setVatNumber(editTenant.vat_number);
      } else {
        setName(""); setSlug(""); setSlugManual(false); setPlan("free"); setVatNumber("");
      }
      setSlugError("");
    }
  }, [open, editTenant]);

  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  const mutation = useMutation({
    mutationFn: async () => {
      // Slug uniqueness check
      const { data: existing } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", slug.trim())
        .maybeSingle();
      if (existing && existing.id !== editTenant?.id) {
        throw new Error("Slug già in uso");
      }

      if (editTenant) {
        const { error } = await supabase.from("tenants").update({
          name: name.trim(),
          slug: slug.trim(),
          plan,
          vat_number: vatNumber.trim(),
        }).eq("id", editTenant.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenants").insert({
          name: name.trim(),
          slug: slug.trim(),
          plan,
          vat_number: vatNumber.trim(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sa-tenants"] });
      qc.invalidateQueries({ queryKey: ["superadmin-stats"] });
      onOpenChange(false);
      toast({ title: editTenant ? "Tenant aggiornato" : "Tenant creato con successo" });
    },
    onError: (err: Error) => {
      if (err.message === "Slug già in uso") {
        setSlugError(err.message);
      } else {
        toast({ title: "Errore", description: err.message, variant: "destructive" });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editTenant ? "Modifica Tenant" : "Nuovo Tenant"}</DialogTitle>
          <DialogDescription>
            {editTenant ? "Modifica i dati del tenant." : "Compila i dati per creare un nuovo tenant."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corporation" required />
          </div>
          <div className="space-y-2">
            <Label>P.IVA</Label>
            <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="IT12345678901" required />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManual(true); setSlugError(""); }}
              placeholder="acme-corporation"
              required
              className="font-mono text-sm"
            />
            {slugError && <p className="text-xs text-destructive">{slugError}</p>}
          </div>
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
            <Button type="submit" disabled={mutation.isPending || !name.trim() || !slug.trim() || !vatNumber.trim()}>
              {mutation.isPending ? "Salvataggio…" : editTenant ? "Salva" : "Crea Tenant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function Tenants() {
  const navigate = useNavigate();
  const tenants = useTenantList();

  const [search, setSearch] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<TenantRow | null>(null);

  const filtered = useMemo(() => {
    if (!tenants.data) return [];
    let list = tenants.data;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
    }
    if (filterPlan !== "all") list = list.filter((t) => t.plan === filterPlan);

    return [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [tenants.data, search, filterPlan, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/40" />;
    return sortAsc ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">Gestione Tenant</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Nuovo Tenant
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca tenant..." className="pl-9" />
        </div>
        <Select value={filterPlan} onValueChange={setFilterPlan}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Piano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i piani</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {tenants.isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !filtered.length ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{search || filterPlan !== "all" ? "Nessun tenant trovato" : "Nessun tenant ancora"}</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {([
                  ["name", "Nome"],
                  ["slug", "Slug"],
                  ["plan", "Piano"],
                  ["userCount", "Utenti"],
                  ["meetingCount", "Riunioni"],
                  ["lastMeeting", "Ultima Riunione"],
                  ["created_at", "Creato il"],
                ] as [SortKey, string][]).map(([k, l]) => (
                  <TableHead key={k} className="cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(k)}>
                    <span className="inline-flex items-center">{l}<SortIcon col={k} /></span>
                  </TableHead>
                ))}
                <TableHead className="w-[100px]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const pb = planBadge[t.plan] ?? planBadge.free;
                return (
                  <TableRow key={t.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{t.slug}</TableCell>
                    <TableCell>
                      <Badge variant={pb.variant} className={pb.className}>{t.plan}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{t.userCount}</TableCell>
                    <TableCell className="font-mono text-sm">{t.meetingCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.lastMeeting
                        ? new Date(t.lastMeeting).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => { e.stopPropagation(); setEditTenant(t); }}
                          title="Modifica"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/superadmin/tenants/${t.id}`)}
                          title="Dettaglio"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
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

      {/* Dialogs */}
      <TenantFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <TenantFormDialog open={!!editTenant} onOpenChange={(v) => { if (!v) setEditTenant(null); }} editTenant={editTenant} />
    </div>
  );
}
