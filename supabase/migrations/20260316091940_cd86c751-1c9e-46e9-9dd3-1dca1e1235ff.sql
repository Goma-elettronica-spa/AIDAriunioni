INSERT INTO public.users (id, email, full_name, role, tenant_id, is_active)
VALUES (
  '4b1e62a1-b3a5-4410-8d8b-f3b5b5eef5f0',
  'giorgio.morelligozzo@goma.it',
  'Giorgio Morelli Gozzo',
  'superadmin',
  NULL,
  true
)
ON CONFLICT (id) DO NOTHING;