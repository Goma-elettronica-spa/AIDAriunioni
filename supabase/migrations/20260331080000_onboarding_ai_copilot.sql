-- ============================================================
-- Onboarding, Enrichment, Financials, AI Copilot
-- ============================================================

-- 1. Tenant onboarding data
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sector_ateco text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sector_description text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS employee_range text;        -- '1-10','11-50','51-200','201-500','500+'
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS revenue_range text;         -- '<1M','1-5M','5-10M','10-50M','50M+'
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS challenges text[];          -- top 3 business challenges
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meeting_frequency text DEFAULT 'monthly'; -- monthly, biweekly, quarterly

-- 2. External enrichment cache
CREATE TABLE IF NOT EXISTS tenant_enrichment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source text NOT NULL,                -- 'clay', 'openapi', 'manual'
  data jsonb NOT NULL DEFAULT '{}',
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, source)
);
ALTER TABLE tenant_enrichment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_enrichment_tenant" ON tenant_enrichment
  FOR ALL USING (tenant_id = current_user_tenant_id());

-- 3. Uploaded financials (bilancio PDF)
CREATE TABLE IF NOT EXISTS tenant_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL,
  pdf_url text,
  extracted_data jsonb,               -- fatturato, ebitda, costo_personale, margine, debito_equity
  extracted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, fiscal_year)
);
ALTER TABLE tenant_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_financials_tenant" ON tenant_financials
  FOR ALL USING (tenant_id = current_user_tenant_id());

-- 4. AI Copilot suggestions per user per meeting
CREATE TABLE IF NOT EXISTS ai_copilot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  type text NOT NULL,                  -- 'talking_points', 'kpi_prep', 'agenda', 'brief', 'variance_explain', 'post_meeting'
  content jsonb NOT NULL DEFAULT '{}', -- structured AI output
  model text,                          -- 'claude-sonnet-4-6' etc
  created_at timestamptz DEFAULT now()
);
ALTER TABLE ai_copilot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_copilot_own" ON ai_copilot
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_ai_copilot_user_meeting ON ai_copilot(user_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_ai_copilot_tenant ON ai_copilot(tenant_id);

-- 5. AI-suggested KPIs (from onboarding)
ALTER TABLE kpi_definitions ADD COLUMN IF NOT EXISTS ai_suggested boolean DEFAULT false;
ALTER TABLE kpi_definitions ADD COLUMN IF NOT EXISTS suggestion_source text; -- 'onboarding', 'bilancio', 'enrichment'
ALTER TABLE kpi_definitions ADD COLUMN IF NOT EXISTS ai_rationale text;      -- why this KPI was suggested

-- 6. Storage bucket for financials PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('financials', 'financials', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "financials_tenant_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'financials'
    AND (storage.foldername(name))[1] = current_user_tenant_id()::text
  );

CREATE POLICY "financials_tenant_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'financials'
    AND (storage.foldername(name))[1] = current_user_tenant_id()::text
  );
