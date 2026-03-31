-- Allow org_admin to update their own tenant (needed for onboarding)
CREATE POLICY "org_admin_update_own_tenant" ON tenants
  FOR UPDATE
  USING (id = current_user_tenant_id())
  WITH CHECK (id = current_user_tenant_id());
