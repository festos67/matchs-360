REVOKE EXECUTE ON FUNCTION public.get_club_overview_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_club_overview_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_club_overview_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_overview_stats(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_coach_personal_stats(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_personal_stats(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_personal_stats(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_personal_stats(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO service_role;