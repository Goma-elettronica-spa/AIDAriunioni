
-- Junction table: KPI can be assigned to multiple users
CREATE TABLE public.kpi_definition_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kpi_id, user_id)
);

ALTER TABLE public.kpi_definition_users ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "tenant_select" ON public.kpi_definition_users
  FOR SELECT TO public
  USING (tenant_id = current_user_tenant_id());

CREATE POLICY "admin_manage" ON public.kpi_definition_users
  FOR ALL TO public
  USING (tenant_id = current_user_tenant_id() AND current_user_role() IN ('org_admin', 'information_officer'));

CREATE POLICY "superadmin_all" ON public.kpi_definition_users
  FOR ALL TO public
  USING (is_superadmin());

-- Add is_company_wide flag to kpi_definitions (default true)
ALTER TABLE public.kpi_definitions
  ADD COLUMN is_company_wide boolean NOT NULL DEFAULT false;

-- Migrate existing data: KPIs with no user_id and no functional_area_id become company-wide
UPDATE public.kpi_definitions
  SET is_company_wide = true
  WHERE user_id IS NULL AND functional_area_id IS NULL;
