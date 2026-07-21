REVOKE EXECUTE ON FUNCTION public.get_template_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_template_stats(uuid) TO authenticated, service_role;