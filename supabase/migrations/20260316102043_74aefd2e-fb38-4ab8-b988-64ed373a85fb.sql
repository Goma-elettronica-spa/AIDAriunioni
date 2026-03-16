-- Grant execute on registration RPCs to anon role (needed because user isn't confirmed yet at signup time)
GRANT EXECUTE ON FUNCTION public.register_with_new_tenant(uuid, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.register_and_join_tenant(uuid, text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.search_tenant_by_vat(text) TO anon;