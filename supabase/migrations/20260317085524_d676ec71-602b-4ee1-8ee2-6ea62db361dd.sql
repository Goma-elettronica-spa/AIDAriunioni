
-- Allow admins to insert and delete slide_uploads for any user in their tenant
CREATE POLICY "admin_manage_slides"
  ON public.slide_uploads
  FOR ALL
  TO authenticated
  USING (
    tenant_id = current_user_tenant_id()
    AND current_user_role() IN ('org_admin', 'information_officer')
  )
  WITH CHECK (
    tenant_id = current_user_tenant_id()
    AND current_user_role() IN ('org_admin', 'information_officer')
  );
