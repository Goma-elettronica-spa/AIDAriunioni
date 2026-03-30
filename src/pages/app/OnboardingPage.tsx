import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, Loader2, Sparkles, Building2, Users, Target, FileText } from "lucide-react";
import { toast } from "sonner";
import Logo from "@/components/Logo";

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

const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const REVENUE_RANGES = ["< 1M €", "1-5M €", "5-10M €", "10-50M €", "50M+ €"];

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

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form state
  const [sector, setSector] = useState("");
  const [sectorDesc, setSectorDesc] = useState("");
  const [employeeRange, setEmployeeRange] = useState("");
  const [revenueRange, setRevenueRange] = useState("");
  const [challenges, setChallenges] = useState<string[]>([]);
  const [customChallenge, setCustomChallenge] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const toggleChallenge = (c: string) => {
    setChallenges((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < 3 ? [...prev, c] : prev
    );
  };

  const addCustomChallenge = () => {
    if (customChallenge.trim() && challenges.length < 3) {
      setChallenges((prev) => [...prev, customChallenge.trim()]);
      setCustomChallenge("");
    }
  };

  const handleUploadPdf = async () => {
    if (!pdfFile || !user?.tenant_id) return;
    setUploading(true);
    try {
      const path = `${user.tenant_id}/${new Date().getFullYear()}_bilancio.pdf`;
      const { error } = await supabase.storage.from("financials").upload(path, pdfFile, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("financials").getPublicUrl(path);

      await supabase.from("tenant_financials" as any).upsert({
        tenant_id: user.tenant_id,
        fiscal_year: new Date().getFullYear() - 1,
        pdf_url: urlData.publicUrl,
      });
      toast.success("Bilancio caricato");
    } catch (e: any) {
      toast.error("Errore upload: " + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    if (!user?.tenant_id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({
          sector_ateco: sector,
          sector_description: sectorDesc,
          employee_range: employeeRange,
          revenue_range: revenueRange,
          challenges,
          onboarding_completed_at: new Date().toISOString(),
        } as any)
        .eq("id", user.tenant_id);

      if (error) throw error;

      if (pdfFile) await handleUploadPdf();

      // Trigger AI KPI suggestion (fire and forget)
      supabase.functions.invoke("suggest-kpis", {
        body: { tenant_id: user.tenant_id },
      }).catch(() => {});

      toast.success("Onboarding completato! Le KPI AI stanno arrivando...");
      navigate("/dashboard", { replace: true });
    } catch (e: any) {
      toast.error("Errore: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    {
      icon: Building2,
      title: "La tua azienda",
      subtitle: "Aiutaci a capire il contesto per suggerirti KPI rilevanti",
    },
    {
      icon: Users,
      title: "Dimensione",
      subtitle: "Queste info ci servono per calibrare i benchmark",
    },
    {
      icon: Target,
      title: "Sfide principali",
      subtitle: "Seleziona fino a 3 sfide su cui concentrare le riunioni",
    },
    {
      icon: FileText,
      title: "Bilancio (opzionale)",
      subtitle: "Caricalo per ottenere KPI con target numerici reali",
    },
    {
      icon: Sparkles,
      title: "Tutto pronto",
      subtitle: "L'AI analizzerà i tuoi dati e suggerirà KPI personalizzate",
    },
  ];

  const currentStep = steps[step];
  const StepIcon = currentStep.icon;
  const canNext =
    step === 0 ? sector !== "" :
    step === 1 ? employeeRange !== "" && revenueRange !== "" :
    step === 2 ? challenges.length >= 1 :
    true;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 px-4">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-foreground" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <Card className="border border-border shadow-sm">
          <CardContent className="pt-8 pb-8 px-8">
            {/* Step header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-foreground text-background flex items-center justify-center">
                <StepIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{currentStep.title}</h2>
                <p className="text-sm text-muted-foreground">{currentStep.subtitle}</p>
              </div>
            </div>

            {/* Step 0: Settore */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Settore</Label>
                  <Select value={sector} onValueChange={setSector}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona settore..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTORS.map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrizione attività (opzionale)</Label>
                  <Input
                    placeholder="es. Produzione componenti elettronici per automotive"
                    value={sectorDesc}
                    onChange={(e) => setSectorDesc(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 1: Dimensione */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Numero dipendenti</Label>
                  <Select value={employeeRange} onValueChange={setEmployeeRange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona range..." />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_RANGES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fatturato annuo</Label>
                  <Select value={revenueRange} onValueChange={setRevenueRange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona range..." />
                    </SelectTrigger>
                    <SelectContent>
                      {REVENUE_RANGES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 2: Sfide */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {CHALLENGES.map((c) => (
                    <Badge
                      key={c}
                      variant={challenges.includes(c) ? "default" : "outline"}
                      className="cursor-pointer text-sm py-1.5 px-3"
                      onClick={() => toggleChallenge(c)}
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Altra sfida..."
                    value={customChallenge}
                    onChange={(e) => setCustomChallenge(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomChallenge()}
                  />
                  <Button variant="outline" size="sm" onClick={addCustomChallenge} disabled={!customChallenge.trim() || challenges.length >= 3}>
                    Aggiungi
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {challenges.length}/3 selezionate
                </p>
              </div>
            )}

            {/* Step 3: Bilancio PDF */}
            {step === 3 && (
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-foreground/40 transition-colors"
                  onClick={() => document.getElementById("pdf-upload")?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  {pdfFile ? (
                    <p className="text-sm font-medium">{pdfFile.name}</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">Carica il bilancio PDF</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        L'AI estrarrà fatturato, EBITDA, margini per suggerire target realistici
                      </p>
                    </>
                  )}
                </div>
                <input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground text-center">
                  Puoi sempre caricarlo dopo dalle impostazioni
                </p>
              </div>
            )}

            {/* Step 4: Riepilogo */}
            {step === 4 && (
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settore</span>
                    <span className="font-medium">{SECTORS.find((s) => s.code === sector)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dipendenti</span>
                    <span className="font-medium">{employeeRange}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fatturato</span>
                    <span className="font-medium">{revenueRange}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sfide</span>
                    <span className="font-medium text-right">{challenges.join(", ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bilancio</span>
                    <span className="font-medium">{pdfFile ? pdfFile.name : "Non caricato"}</span>
                  </div>
                </div>
                <div className="bg-foreground/5 rounded-lg p-4 flex items-start gap-3">
                  <Sparkles className="h-5 w-5 text-foreground mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">L'AI suggerirà KPI personalizzate</p>
                    <p className="text-muted-foreground mt-0.5">
                      Basate sul tuo settore, dimensione e sfide. Potrai accettarle, modificarle o scartarle.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8">
              {step > 0 ? (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                  Indietro
                </Button>
              ) : (
                <div />
              )}
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                  Avanti
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Completa e genera KPI
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
