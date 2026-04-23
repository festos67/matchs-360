CREATE FUNCTION public.admin_list_users_paginated(
  p_caller uuid,
  p_is_admin boolean,
  p_page integer,
  p_size integer,
  p_search text DEFAULT NULL,
  p_role_filter text DEFAULT NULL,
  p_club_filter uuid DEFAULT NULL,
  p_coach_filter uuid DEFAULT NULL,
  p_player_filter uuid DEFAULT NULL
)
RETURNS TABLE (out_user_id uuid, out_total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $stub$
BEGIN
  RETURN QUERY SELECT NULL::uuid, 0::bigint WHERE false;
END
$stub$;