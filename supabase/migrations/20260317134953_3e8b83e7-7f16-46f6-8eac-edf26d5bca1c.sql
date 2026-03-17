
-- Junction table for many-to-many user ↔ board_role
CREATE TABLE public.user_board_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  board_role_id uuid NOT NULL REFERENCES public.board_roles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, board_role_id)
);

ALTER TABLE public.user_board_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "tenant_select" ON public.user_board_roles
  FOR SELECT TO public
  USING (tenant_id = current_user_tenant_id());

CREATE POLICY "admin_manage" ON public.user_board_roles
  FOR ALL TO public
  USING (tenant_id = current_user_tenant_id() AND current_user_role() IN ('org_admin', 'information_officer'));

CREATE POLICY "superadmin_all" ON public.user_board_roles
  FOR ALL TO public
  USING (is_superadmin());

-- Migrate existing data from users.board_role_id
INSERT INTO public.user_board_roles (user_id, board_role_id, tenant_id)
SELECT u.id, u.board_role_id, u.tenant_id
FROM public.users u
WHERE u.board_role_id IS NOT NULL AND u.tenant_id IS NOT NULL;
