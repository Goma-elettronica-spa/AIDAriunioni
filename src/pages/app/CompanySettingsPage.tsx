import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Building2,
  Save,
  Download,
  Printer,
  Loader2,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ── Constants ────────────────────────────────────────────────────────────────

const SECTORS = [
  { code: "C", label: "Manifatturiero" },
  { code: "F", label: "Costruzioni" },
  { code: "G", label: "Commercio" },
  { code: "H", label: "Trasporto e logistica" },
  { code: "I", label: "Alloggio e ristorazione" },
  { code: "J", label: "IT e comunicazione" },
  { code: "K", label: "Finanza e assicurazioni" },
  { code: "L", label: "Immobiliare" },
  { code: "M", label: "Consulenza e servizi professionali" },
  { code: "N", label: "Servizi alle imprese" },
  { code: "Q", label: "Sanità" },
  { code: "R", label: "Intrattenimento" },
  { code: "S", label: "Altri servizi" },
];

const CHALLENGES = [
  "Marginalità in calo",
  "Turnover personale",
  "Crescita fatturato",
  "Efficienza operativa",
  "Digitalizzazione",
  "Compliance e normative",
  "Gestione cash flow",
  "Espansione mercati",
  "Qualità prodotto/servizio",
  "Customer retention",
  "Supply chain",
  "Sostenibilità ESG",
];

// ── Types ────────────────────────────────────────────────────────────────────

interface TenantData {
  id: string;
  name: string;
  sector_ateco: string | null;
  sector_description: string | null;
  employee_count: number | null;
  revenue_millions: number | null;
  challenges: string[] | null;
  org_chart_data: Record<string, any> | null;
}

interface KpiDef {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  direction: string;
  target_value: number | null;
  ai_rationale: string | null;
  ai_priority: number | null;
  ai_suggested: boolean;
  is_active: boolean;
  functional_areas: { id: string; name: string } | null;
}

interface FunctionalArea {
  id: string;
  name: string;
  description: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CompanySettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tenantId = user?.tenant_id;

  // ── Form state ─────────────────────────────────────────────────────────────

  const [name, setName] = useState("");
  const [sectorAteco, setSectorAteco] = useState("");
  const [sectorDescription, setSectorDescription] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [revenueMil, setRevenueMil] = useState("");
  const [challenges, setChallenges] = useState<string[]>([]);
  const [customChallenge, setCustomChallenge] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const tenantQuery = useQuery({
    queryKey: ["company-settings-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, sector_ateco, sector_description, employee_count, revenue_millions, challenges, org_chart_data")
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      return data as unknown as TenantData;
    },
  });

  const kpiQuery = useQuery({
    queryKey: ["company-kpis-all", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kpi_definitions")
        .select("id, name, description, unit, direction, target_value, ai_rationale, ai_priority, ai_suggested, is_active, functional_areas(id, name)")
        .eq("tenant_id", tenantId!)
        .order("ai_priority", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as unknown as KpiDef[];
    },
  });

  const areasQuery = useQuery({
    queryKey: ["company-functional-areas", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("functional_areas")
        .select("id, name, description")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data as FunctionalArea[];
    },
  });

  // ── Sync form when data loads ──────────────────────────────────────────────

  useEffect(() => {
    if (tenantQuery.data) {
      const t = tenantQuery.data;
      setName(t.name ?? "");
      setSectorAteco(t.sector_ateco ?? "");
      setSectorDescription(t.sector_description ?? "");
      setEmployeeCount(t.employee_count != null ? String(t.employee_count) : "");
      setRevenueMil(t.revenue_millions != null ? String(t.revenue_millions) : "");
      setChallenges(t.challenges ?? []);
    }
  }, [tenantQuery.data]);

  // ── Save mutation ──────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tenants")
        .update({
          name,
          sector_ateco: sectorAteco,
          sector_description: sectorDescription,
          employee_count: employeeCount ? parseInt(employeeCount, 10) : null,
          revenue_millions: revenueMil ? parseFloat(revenueMil) : null,
          challenges,
        } as any)
        .eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings-tenant"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-onboarding"] });
      toast.success("Dati aziendali aggiornati");
    },
    onError: (e: Error) => {
      toast.error("Errore nel salvataggio: " + e.message);
    },
  });

  // ── Challenge helpers ──────────────────────────────────────────────────────

  const toggleChallenge = (c: string) => {
    setChallenges((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < 5 ? [...prev, c] : prev
    );
  };

  const addCustomChallenge = () => {
    const trimmed = customChallenge.trim();
    if (trimmed && !challenges.includes(trimmed) && challenges.length < 5) {
      setChallenges((prev) => [...prev, trimmed]);
      setCustomChallenge("");
    }
  };

  // ── Org chart table data ───────────────────────────────────────────────────

  const orgChartRows = (() => {
    const data = tenantQuery.data?.org_chart_data;
    if (!data) return [];

    // Expect org_chart_data to have a departments array or similar structure
    if (Array.isArray(data.departments)) {
      return data.departments.map((d: any) => ({
        name: d.name ?? d.department ?? "-",
        head: d.head ?? d.manager ?? "-",
        count: d.count ?? d.headcount ?? d.people ?? 0,
      }));
    }

    // Fallback: if it's an object with department keys
    return Object.entries(data)
      .filter(([k]) => k !== "ceo" && k !== "total" && k !== "source")
      .map(([key, val]: [string, any]) => ({
        name: typeof val === "object" ? (val.name ?? key) : key,
        head: typeof val === "object" ? (val.head ?? "-") : "-",
        count: typeof val === "object" ? (val.count ?? val.headcount ?? 0) : val,
      }));
  })();

  // ── MD Report Generator ────────────────────────────────────────────────────

  const generateReport = () => {
    const t = tenantQuery.data;
    const kpis = kpiQuery.data ?? [];
    const areas = areasQuery.data ?? [];

    if (!t) return "";

    const sectorLabel = SECTORS.find((s) => s.code === t.sector_ateco)?.label ?? t.sector_ateco ?? "";
    const desc = t.sector_description ? ` — ${t.sector_description}` : "";

    let md = `# ${t.name} — KPI Framework per il CdA\n\n`;
    md += `**Dipendenti:** ${t.employee_count ?? "N/D"} | **Fatturato:** ${t.revenue_millions ?? "N/D"}M EUR | **Settore:** ${sectorLabel}${desc}\n`;
    md += `**Sfide:** ${(t.challenges ?? []).join(", ") || "N/D"}\n`;
    md += `**Data report:** ${new Date().toLocaleDateString("it-IT")}\n\n`;
    md += `---\n\n`;

    // Org chart summary if available
    if (orgChartRows.length > 0) {
      md += `## STRUTTURA ORGANIZZATIVA — Headcount per area\n\n`;
      md += `| Dipartimento | Responsabile | Persone | % su totale |\n`;
      md += `|---|---|---|---|\n`;
      const total = orgChartRows.reduce((sum: number, r: any) => sum + (r.count || 0), 0);
      for (const row of orgChartRows) {
        const pct = total > 0 ? ((row.count / total) * 100).toFixed(0) : "0";
        md += `| ${row.name} | ${row.head} | **${row.count}** | ${pct}% |\n`;
      }
      md += `\n---\n\n`;
    }

    // Group KPIs by area
    const activeKpis = kpis.filter((k) => k.is_active);
    const suggestedInactive = kpis.filter((k) => k.ai_suggested && !k.is_active);

    // Company-level KPIs (no area)
    const companyKpis = activeKpis.filter((k) => !k.functional_areas);
    if (companyKpis.length > 0) {
      md += `## KPI AZIENDALI\n\n`;
      md += `| # | KPI | Target | Unità | Direzione | Razionale AI |\n`;
      md += `|---|-----|--------|-------|-----------|---------------|\n`;
      companyKpis.forEach((k, i) => {
        const dir = k.direction === "up_is_good" ? "Crescita" : k.direction === "down_is_good" ? "Riduzione" : k.direction;
        md += `| ${i + 1} | **${k.name}** | ${k.target_value ?? "N/D"} | ${k.unit} | ${dir} | ${k.ai_rationale ?? "-"} |\n`;
      });
      md += `\n---\n\n`;
    }

    // KPIs by area
    const areaMap = new Map<string, { areaName: string; kpis: KpiDef[] }>();
    for (const k of activeKpis) {
      if (!k.functional_areas) continue;
      const aId = k.functional_areas.id;
      if (!areaMap.has(aId)) {
        areaMap.set(aId, { areaName: k.functional_areas.name, kpis: [] });
      }
      areaMap.get(aId)!.kpis.push(k);
    }

    if (areaMap.size > 0) {
      md += `## KPI PER AREA FUNZIONALE\n\n`;
      for (const [, group] of areaMap) {
        md += `### ${group.areaName}\n\n`;
        md += `| # | KPI | Target | Unità | Direzione | Razionale AI |\n`;
        md += `|---|-----|--------|-------|-----------|---------------|\n`;
        group.kpis.forEach((k, i) => {
          const dir = k.direction === "up_is_good" ? "Crescita" : k.direction === "down_is_good" ? "Riduzione" : k.direction;
          md += `| ${i + 1} | **${k.name}** | ${k.target_value ?? "N/D"} | ${k.unit} | ${dir} | ${k.ai_rationale ?? "-"} |\n`;
        });
        md += `\n`;
      }
      md += `---\n\n`;
    }

    // Suggested but not yet accepted
    if (suggestedInactive.length > 0) {
      md += `## KPI SUGGERITE (non ancora attive)\n\n`;
      md += `| # | KPI | Area | Priorità AI | Razionale |\n`;
      md += `|---|-----|------|-------------|----------|\n`;
      suggestedInactive.forEach((k, i) => {
        md += `| ${i + 1} | ${k.name} | ${k.functional_areas?.name ?? "Aziendale"} | ${k.ai_priority ?? "-"} | ${k.ai_rationale ?? "-"} |\n`;
      });
      md += `\n---\n\n`;
    }

    // Areas summary
    if (areas.length > 0) {
      md += `## AREE FUNZIONALI\n\n`;
      md += `| Area | Descrizione | KPI Attive |\n`;
      md += `|------|-------------|------------|\n`;
      for (const a of areas) {
        const count = activeKpis.filter((k) => k.functional_areas?.id === a.id).length;
        md += `| ${a.name} | ${a.description ?? "-"} | ${count} |\n`;
      }
      md += `\n`;
    }

    md += `---\n\n*Report generato automaticamente da Riunioni in Cloud*\n`;
    return md;
  };

  const handleDownload = () => {
    const md = generateReport();
    if (!md) {
      toast.error("Nessun dato disponibile per il report");
      return;
    }
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(tenantQuery.data?.name ?? "report").replace(/\s+/g, "_")}_KPI_Report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Report scaricato");
  };

  const handlePrint = () => {
    window.print();
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (tenantQuery.isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-foreground" />
        <h1 className="text-2xl font-semibold text-foreground">Azienda</h1>
      </div>

      {/* ─── Company Info Card ────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dati aziendali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Company name */}
          <div className="space-y-1.5">
            <Label htmlFor="company-name">Nome azienda</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome dell'azienda"
            />
          </div>

          {/* Sector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sector-ateco">Settore ATECO</Label>
              <select
                id="sector-ateco"
                value={sectorAteco}
                onChange={(e) => setSectorAteco(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Seleziona settore</option>
                {SECTORS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sector-desc">Descrizione settore</Label>
              <Input
                id="sector-desc"
                value={sectorDescription}
                onChange={(e) => setSectorDescription(e.target.value)}
                placeholder="es. Sistemi elettronici rugged"
              />
            </div>
          </div>

          {/* Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="employee-count">Numero dipendenti</Label>
              <Input
                id="employee-count"
                type="number"
                min={1}
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
                placeholder="es. 195"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revenue">Fatturato (M EUR)</Label>
              <Input
                id="revenue"
                type="number"
                min={0}
                step={0.1}
                value={revenueMil}
                onChange={(e) => setRevenueMil(e.target.value)}
                placeholder="es. 81"
              />
            </div>
          </div>

          <Separator />

          {/* Challenges */}
          <div className="space-y-3">
            <Label>Sfide principali</Label>
            <div className="flex flex-wrap gap-2">
              {CHALLENGES.map((c) => (
                <Badge
                  key={c}
                  variant={challenges.includes(c) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => toggleChallenge(c)}
                >
                  {c}
                </Badge>
              ))}
            </div>
            {/* Custom challenge input */}
            <div className="flex items-center gap-2">
              <Input
                value={customChallenge}
                onChange={(e) => setCustomChallenge(e.target.value)}
                placeholder="Aggiungi sfida personalizzata"
                className="max-w-xs"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomChallenge())}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addCustomChallenge}
                disabled={!customChallenge.trim() || challenges.length >= 5}
              >
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi
              </Button>
            </div>
            {/* Selected challenges */}
            {challenges.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {challenges.map((c) => (
                  <Badge key={c} variant="secondary" className="flex items-center gap-1">
                    {c}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => setChallenges((prev) => prev.filter((x) => x !== c))}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Org chart summary */}
          {orgChartRows.length > 0 && (
            <div className="space-y-3">
              <Label>Organigramma — headcount per area</Label>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dipartimento</TableHead>
                      <TableHead>Responsabile</TableHead>
                      <TableHead className="text-right">Persone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orgChartRows.map((row: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-muted-foreground">{row.head}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50">
                      <TableCell className="font-semibold" colSpan={2}>
                        Totale
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {orgChartRows.reduce((s: number, r: any) => s + (r.count || 0), 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center justify-end pt-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva modifiche
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── KPI Report Card ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report KPI per il CdA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Scarica il framework KPI completo con mappa delle interazioni e analisi organigramma
          </p>

          <div className="flex items-center gap-3">
            <Button
              variant="default"
              onClick={handleDownload}
              disabled={kpiQuery.isLoading}
            >
              {kpiQuery.isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Scarica .md
            </Button>

            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Stampa
            </Button>
          </div>

          {/* Quick summary */}
          {kpiQuery.data && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
              <span>{kpiQuery.data.filter((k) => k.is_active).length} KPI attive</span>
              <span>{kpiQuery.data.filter((k) => k.ai_suggested && !k.is_active).length} suggerite in attesa</span>
              <span>{areasQuery.data?.length ?? 0} aree funzionali</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
