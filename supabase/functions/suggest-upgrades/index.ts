import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { transcriptText, users, kpis } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!transcriptText) {
      return new Response(JSON.stringify({ error: "No transcript text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usersList = (users ?? [])
      .map((u: { full_name: string; job_title: string | null }) =>
        `- ${u.full_name}: ${u.job_title || "Nessun ruolo"}`
      )
      .join("\n");

    const kpisList = (kpis ?? [])
      .map((k: { name: string; unit: string; area_name: string }) =>
        `- ${k.area_name}: ${k.name} (${k.unit})`
      )
      .join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `Sei un consulente strategico esperto nell'analisi di riunioni dirigenziali italiane. Analizzi trascrizioni e suggerisci proposte di miglioramento (upgrade) concrete, quantificabili e azionabili per l'azienda. Rispondi SOLO con l'output della funzione richiesta.`,
          },
          {
            role: "user",
            content: `Analizza questa trascrizione/riassunto di una riunione dirigenziale e suggerisci 3-7 proposte di miglioramento (upgrade) concrete e quantificabili per l'azienda.

I ruoli disponibili nell'organizzazione sono:
${usersList}

Le KPI monitorate sono:
${kpisList || "Nessuna KPI definita"}

TRASCRIZIONE/RIASSUNTO:
${transcriptText.slice(0, 30000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_upgrades",
              description: "Restituisce 3-7 proposte di miglioramento (upgrade) suggerite dalla trascrizione della riunione.",
              parameters: {
                type: "object",
                properties: {
                  upgrades: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Titolo breve e specifico della miglioria" },
                        description: { type: "string", description: "Descrizione di cosa fare (2-3 frasi)" },
                        suggested_role: { type: "string", description: "Il ruolo aziendale più adatto (es. 'Direttore Commerciale', 'CFO')" },
                        reason_why: { type: "string", enum: ["revenue_generation", "cost_cutting"], description: "Se genera ricavi o taglia costi" },
                        value_unit: { type: "string", enum: ["money", "license_cost", "man_hours"], description: "Unità di misura del valore" },
                        value_amount: { type: "number", description: "Stima numerica del valore aggiunto" },
                        linked_kpi_name: { type: "string", description: "Nome della KPI collegata, se identificabile" },
                      },
                      required: ["title", "description", "suggested_role", "reason_why", "value_unit", "value_amount"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["upgrades"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_upgrades" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("AI gateway error:", status, text);

      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit superato. Riprova tra qualche minuto." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Crediti AI esauriti. Aggiungi crediti nel workspace Lovable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Errore gateway AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          return new Response(JSON.stringify({ upgrades: parsed.upgrades ?? parsed }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          // ignore
        }
      }
      throw new Error("No tool call in AI response");
    }

    const args = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ upgrades: args.upgrades }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-upgrades error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
