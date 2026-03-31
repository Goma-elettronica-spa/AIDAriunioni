import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id } = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch tenant data and functional areas in parallel
    const [tenantRes, areasRes, financialsRes] = await Promise.all([
      sb.from("tenants")
        .select("name, sector_ateco, sector_description, employee_count, revenue_millions, employee_range, revenue_range, challenges")
        .eq("id", tenant_id)
        .single(),
      sb.from("functional_areas")
        .select("id, name")
        .eq("tenant_id", tenant_id),
      sb.from("tenant_financials")
        .select("extracted_data, fiscal_year")
        .eq("tenant_id", tenant_id)
        .order("fiscal_year", { ascending: false })
        .limit(1),
    ]);

    const tenant = tenantRes.data;
    if (!tenant) throw new Error("Tenant not found");

    const areas = areasRes.data || [];
    const areaMap = Object.fromEntries(areas.map((a: any) => [a.name, a.id]));
    const areaNames = areas.map((a: any) => a.name);

    const financialContext = financialsRes.data?.[0]?.extracted_data
      ? `\n\nDATI FINANZIARI (${financialsRes.data[0].fiscal_year}):\n${JSON.stringify(financialsRes.data[0].extracted_data, null, 2)}`
      : "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: `Sei un consulente strategico esperto in KPI aziendali italiane.
Suggerisci KPI concrete, misurabili e rilevanti per riunioni CdA mensili.
Ogni KPI deve avere un target realistico basato sul settore e dimensione dell'azienda.
Ogni KPI DEVE essere assegnata a un'area funzionale specifica tra quelle fornite.
Suggerisci almeno 2 KPI per ogni area funzionale, fino a un massimo di 3-4 per le aree più critiche.
Rispondi SOLO con JSON valido, nessun testo aggiuntivo.`,
        messages: [
          {
            role: "user",
            content: `Suggerisci KPI per questa azienda, distribuite tra le aree funzionali.

AZIENDA: ${tenant.name}
SETTORE: ${tenant.sector_description || tenant.sector_ateco || "Non specificato"}
DIPENDENTI: ${tenant.employee_count ? tenant.employee_count + " persone" : tenant.employee_range || "Non specificato"}
FATTURATO: ${tenant.revenue_millions ? tenant.revenue_millions + " milioni €" : tenant.revenue_range || "Non specificato"}
SFIDE PRINCIPALI: ${(tenant.challenges || []).join(", ") || "Non specificate"}

AREE FUNZIONALI DISPONIBILI (usa questi nomi ESATTI):
${areaNames.map((n: string) => `- ${n}`).join("\n")}
${financialContext}

Rispondi con questo formato JSON:
{
  "kpis": [
    {
      "name": "Nome KPI",
      "description": "Cosa misura e perché è importante",
      "unit": "EUR" | "%" | "giorni" | "numero" | "ore",
      "direction": "up" | "down",
      "target_value": 123,
      "functional_area": "Nome esatto dell'area funzionale",
      "rationale": "Perché questa KPI è rilevante per questa azienda specifica"
    }
  ]
}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, errText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text || "";

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    const parsed = JSON.parse(jsonMatch[0]);

    // Insert suggested KPIs with functional_area_id
    const kpiRows = (parsed.kpis || []).map((kpi: any) => ({
      tenant_id,
      name: kpi.name,
      description: kpi.description,
      unit: kpi.unit || "%",
      direction: kpi.direction === "down" ? "down_is_good" : "up_is_good",
      target_value: kpi.target_value,
      is_active: false,
      is_company_wide: false,
      functional_area_id: areaMap[kpi.functional_area] || null,
      ai_suggested: true,
      suggestion_source: financialContext ? "bilancio" : "onboarding",
      ai_rationale: kpi.rationale,
    }));

    if (kpiRows.length) {
      const { error: insertErr } = await sb.from("kpi_definitions").insert(kpiRows);
      if (insertErr) console.error("Insert error:", insertErr);
    }

    return new Response(JSON.stringify({ count: kpiRows.length, kpis: parsed.kpis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-kpis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
