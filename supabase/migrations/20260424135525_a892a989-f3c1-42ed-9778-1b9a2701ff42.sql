-- Revert F-205 REVOKE: re-grant EXECUTE on RLS helper functions to authenticated.
-- These functions are used inside RLS policies, and Postgres requires the caller
-- to have EXECUTE on functions referenced in policies. Revoking broke all RLS
-- evaluations that call them (e.g. get_user_club_admin_ids, is_admin, etc.).
-- Security note: each function is SECURITY DEFINER and only returns data scoped
-- to the passed _user_id; users can only effectively use them on themselves
-- because RLS on user_roles, team_members, supporters_link prevents cross-user reads.

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_admin_of_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_coach_of_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_referent_coach_of_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_player_in_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_coach_of_player(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supporter_of_player(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_club_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_club_admin_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_team_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_referent_coach_team_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supporter_player_team_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_player_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teammate_user_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_player_club_id(uuid) TO authenticated;