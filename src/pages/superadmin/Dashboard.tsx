import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Building2, Users, CalendarDays, CalendarCheck, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function useStats() {
  return useQuery({
    queryKey: ["superadmin-stats"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

      const [tenants, users, meetings, meetingsThisMonth] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("users").select("id", { count: "exact", head: true }),
        supabase.from("meetings").select("id", { count: "exact", head: true }),
        supabase
          .from("meetings")
          .select("id", { count: "exact", head: true })
          .gte("scheduled_date", startOfMonth)
          .lte("scheduled_date", endOfMonth),
      ]);

      return {
        tenants: tenants.count ?? 0,
        users: users.count ?? 0,
        meetings: meetings.count ?? 0,
        meetingsThisMonth: meetingsThisMonth.count ?? 0,
      };
    },
  });
}

function useTenants() {
  return useQuery({
    queryKey: ["superadmin-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, slug, plan, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
}

const statCards = [
  { key: "tenants" as const, label: "Tenant Attivi", icon: Building2 },
  { key: "users" as const, label: "Utenti Totali", icon: Users },
  { key: "meetings" as const, label: "Riunioni Totali", icon: CalendarDays },
  { key: "meetingsThisMonth" as const, label: "Riunioni Questo Mese", icon: CalendarCheck },
];

const planColors: Record<string, string> = {
  free: "secondary",
  pro: "default",
  enterprise: "outline",
};

export default function SuperadminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stats = useStats();
  const tenants = useTenants();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  const createTenant = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tenants").insert({
        name: name.trim(),
        slug: slug.trim(),
        plan,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["superadmin-stats"] });
      setDialogOpen(false);
      setName("");
      setSlug("");
      setSlugManual(false);
      setPlan("free");
      toast({ title: "Tenant creato con successo" });
    },
    onError: (err: Error) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-section-gap">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Tenant
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.key} className="border border-border">
            <CardContent className="p-card-padding">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-md bg-muted">
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              {stats.isLoading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <p className="text-3xl font-semibold font-mono text-foreground">
                  {stats.data?.[card.key] ?? 0}
                </p>
              )}
              <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tenants Table */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Tenant Recenti</h2>

        {tenants.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tenants.error ? (
          <div className="text-center py-12">
            <p className="text-sm text-destructive mb-3">Errore nel caricamento</p>
            <Button variant="outline" size="sm" onClick={() => tenants.refetch()}>
              Riprova
            </Button>
          </div>
        ) : !tenants.data?.length ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">Nessun tenant ancora</p>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crea Tenant
            </Button>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Piano</TableHead>
                  <TableHead>Creato il</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.data.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => navigate(`/superadmin/tenants/${t.id}`)}
                  >
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {t.slug}
                    </TableCell>
                    <TableCell>
                      <Badge variant={planColors[t.plan] as "default" | "secondary" | "outline"}>
                        {t.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuovo Tenant</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createTenant.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Nome</Label>
              <Input
                id="tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corporation"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-slug">Slug</Label>
              <Input
                id="tenant-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugManual(true);
                }}
                placeholder="acme-corporation"
                required
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Piano</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={createTenant.isPending || !name.trim() || !slug.trim()}
              >
                {createTenant.isPending ? "Creazione…" : "Crea Tenant"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
