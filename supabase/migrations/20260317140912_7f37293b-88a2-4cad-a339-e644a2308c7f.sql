
-- Add UPDATE policy for slides bucket (needed for upsert)
CREATE POLICY "slides_user_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'slides'
  AND (storage.foldername(name))[1] = (current_user_tenant_id())::text
);
