import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CopilotRequest {
  type: "talking_points" | "kpi_prep" | "agenda" | "brief" | "improvements";
  user_id: string;
  tenant_id: string;
  meeting_id: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, user_id, tenant_id, meeting_id } = (await req.json()) as CopilotRequest;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // ── Gather context ──────────────────────────────────────────
    const [userRes, tenantRes, kpiRes, tasksRes, commitmentsRes, meetingRes] = await Promise.all([
      sb.from("users").select("full_name, job_title, role").eq("id", user_id).single(),
      sb.from("tenants").select("name, sector_ateco, sector_description, challenges, employee_range, revenue_range").eq("id", tenant_id).single(),
      sb.from("kpi_entries").select(`
        current_value, previous_value, delta, delta_percent, is_improved,
        kpi_definitions!inner(name, unit, direction, target_value)
      `).eq("user_id", user_id).order("created_at", { ascending: false }).limit(20),
      sb.from("board_tasks").select("title, status, deadline_date, description").eq("owner_user_id", user_id).in("status", ["todo", "wip", "stuck"]).limit(15),
      sb.from("commitments").select("description, status, type").eq("user_id", user_id).in("status", ["pending", "in_progress"]).limit(10),
      meeting_id
        ? sb.from("meetings").select("title, scheduled_date, status, summary_text, quarter").eq("id", meeting_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const user = userRes.data;
    const tenant = tenantRes.data;
    const kpis = kpiRes.data || [];
    const tasks = tasksRes.data || [];
    const commitments = commitmentsRes.data || [];
    const meeting = meetingRes.data;

    // Get all team members for agenda/brief
    let teamMembers: any[] = [];
    if (type === "agenda" || type === "brief") {
      const { data } = await sb.from("users").select("full_name, job_title, role").eq("tenant_id", tenant_id).eq("is_active", true);
      teamMembers = data || [];
    }

    // ── Build role-specific prompt ──────────────────────────────
    const contextBlock = `
AZIENDA: ${tenant?.name} | Settore: ${tenant?.sector_description || tenant?.sector_ateco || "N/A"} | Dipendenti: ${tenant?.employee_range || "N/A"} | Fatturato: ${tenant?.revenue_range || "N/A"}
SFIDE: ${(tenant?.challenges || []).join(", ") || "N/A"}

UTENTE: ${user?.full_name} | Ruolo: ${user?.job_title || user?.role}
${meeting ? `RIUNIONE: "${meeting.title}" | Data: ${meeting.scheduled_date} | Stato: ${meeting.status} | Quarter: ${meeting.quarter}` : "NESSUNA RIUNIONE SELEZIONATA"}

KPI RECENTI (ultimi valori):
${kpis.length ? kpis.map((k: any) => `- ${k.kpi_definitions.name}: ${k.current_value} ${k.kpi_definitions.unit} (prev: ${k.previous_value}, delta: ${k.delta_percent}%, ${k.is_improved ? "MIGLIORATA" : "PEGGIORATA"}, target: ${k.kpi_definitions.target_value})`).join("\n") : "Nessuna KPI inserita"}

TASK APERTI:
${tasks.length ? tasks.map((t: any) => `- [${t.status}] ${t.title}${t.deadline_date ? ` (scadenza: ${t.deadline_date})` : ""}`).join("\n") : "Nessun task"}

IMPEGNI ATTIVI:
${commitments.length ? commitments.map((c: any) => `- [${c.type}] ${c.description} (${c.status})`).join("\n") : "Nessun impegno"}
`.trim();

    const prompts: Record<string, { system: string; user: string; format: string }> = {
      talking_points: {
        system: "Sei un coach per dirigenti. Prepari talking points personalizzati per riunioni CdA mensili. Ogni punto deve essere concreto, con numeri quando possibile.",
        user: `Prepara 4-6 talking points per ${user?.full_name} per la prossima riunione.

${contextBlock}

Per ogni punto:
1. Cosa dire (una frase chiara)
2. Il dato a supporto
3. Cosa proporre o chiedere`,
        format: "items",
      },
      kpi_prep: {
        system: "Sei un analista di business intelligence. Spieghi varianze KPI in modo chiaro e suggerisci azioni correttive concrete.",
        user: `Analizza le varianze KPI di ${user?.full_name} e per ognuna spiega perché potrebbe essere cambiata e cosa fare.

${contextBlock}

Per ogni KPI con varianza significativa (>5%):
1. Possibile causa della varianza
2. Azione correttiva suggerita
3. Impatto se non si interviene`,
        format: "items",
      },
      agenda: {
        system: "Sei un facilitatore di riunioni CdA. Crei ordini del giorno strutturati che massimizzano il tempo decisionale.",
        user: `Genera l'ordine del giorno per la prossima riunione CdA.

${contextBlock}

TEAM:
${teamMembers.map((m: any) => `- ${m.full_name}: ${m.job_title || m.role}`).join("\n")}

L'agenda deve includere:
1. Apertura e approvazione verbale precedente (5 min)
2. Review KPI critiche (chi presenta, quanto tempo)
3. Discussione sfide e azioni correttive
4. Stato impegni e task
5. Proposte di miglioramento
6. Varie ed eventuali

Assegna tempi realistici. Totale max 90 minuti.`,
        format: "text",
      },
      brief: {
        system: "Sei un information officer aziendale. Prepari brief pre-riunione chiari, sintetici e azionabili.",
        user: `Genera il brief pre-riunione per il CdA.

${contextBlock}

TEAM:
${teamMembers.map((m: any) => `- ${m.full_name}: ${m.job_title || m.role}`).join("\n")}

Il brief deve contenere:
1. EXECUTIVE SUMMARY (3 righe max)
2. STATO KPI: tabella sintetica con semaforo (verde/giallo/rosso)
3. TASK CRITICI: task scaduti o bloccati
4. IMPEGNI APERTI: stato per persona
5. PUNTI DI ATTENZIONE: cosa richiede decisione immediata
6. PROPOSTE: eventuali miglioramenti da discutere`,
        format: "text",
      },
      improvements: {
        system: "Sei un consulente strategico. Proponi miglioramenti concreti con impatto misurabile basati sui dati aziendali.",
        user: `Basandoti sui dati, suggerisci 3-5 miglioramenti concreti per ${user?.full_name}.

${contextBlock}

Per ogni proposta:
1. Titolo chiaro
2. Cosa fare concretamente
3. Impatto atteso (quantificato)
4. Se è un taglio costi o aumento ricavi`,
        format: "items",
      },
    };

    const prompt = prompts[type];
    if (!prompt) throw new Error(`Unknown copilot type: ${type}`);

    const responseFormat =
      prompt.format === "items"
        ? `Rispondi SOLO con JSON valido:
{"items": [{"title": "...", "detail": "..."}]}`
        : `Rispondi SOLO con JSON valido:
{"text": "il testo formattato con sezioni separate da \\n\\n"}`;

    // ── Call Claude ─────────────────────────────────────────────
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6-20250514",
        max_tokens: 2000,
        system: prompt.system,
        messages: [
          {
            role: "user",
            content: `${prompt.user}\n\n${responseFormat}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const text = aiData.content?.[0]?.text || "";

    // Parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in AI response");
    const parsed = JSON.parse(jsonMatch[0]);

    // Save to ai_copilot table
    await sb.from("ai_copilot").insert({
      tenant_id,
      user_id,
      meeting_id: meeting_id || null,
      type,
      content: parsed,
      model: "claude-sonnet-4-6",
    }).then(({ error }) => { if (error) console.error("Save error:", error); });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
