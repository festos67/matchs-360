CREATE OR REPLACE FUNCTION public.admin_list_users_paginated(
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
SECURITY DEFINER
SET search_path = public
AS $body$
DECLARE
  v_club_ids uuid[];
  v_offset integer;
  v_size integer;
  v_pattern text;
BEGIN
  v_club_ids := public._admin_list_users_check_caller(p_caller, p_is_admin, p_club_filter);
  v_size := LEAST(100, GREATEST(1, COALESCE(p_size, 50)));
  v_offset := (GREATEST(1, COALESCE(p_page, 1)) - 1) * v_size;
  v_pattern := CASE
    WHEN NULLIF(TRIM(COALESCE(p_search, '')), '') IS NULL THEN NULL
    ELSE '%' || TRIM(p_search) || '%'
  END;

  RETURN QUERY
  WITH candidates AS (
    SELECT p.id AS uid, p.created_at AS ref_created
    FROM public.profiles p
    WHERE p.deleted_at IS NULL
      AND (
        p_is_admin
        OR (p.club_id IS NOT NULL AND p.club_id = ANY(v_club_ids))
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur2
          WHERE ur2.user_id = p.id AND ur2.club_id = ANY(v_club_ids)
        )
        OR EXISTS (
          SELECT 1 FROM public.team_members tm0
          JOIN public.teams t0 ON t0.id = tm0.team_id
          WHERE tm0.user_id = p.id
            AND tm0.is_active = true
            AND tm0.deleted_at IS NULL
            AND t0.deleted_at IS NULL
            AND t0.club_id = ANY(v_club_ids)
        )
      )
  ),
  filtered AS (
    SELECT c.uid, c.ref_created
    FROM candidates c
    JOIN public.profiles p ON p.id = c.uid
    WHERE
      (
        v_pattern IS NULL
        OR p.email ILIKE v_pattern
        OR COALESCE(p.first_name, '') ILIKE v_pattern
        OR COALESCE(p.last_name, '') ILIKE v_pattern
        OR COALESCE(p.nickname, '') ILIKE v_pattern
      )
      AND (
        p_role_filter IS NULL
        OR p_role_filter = 'all'
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur3
          WHERE ur3.user_id = c.uid AND ur3.role::text = p_role_filter
        )
        OR (p_role_filter = 'coach' AND EXISTS (
          SELECT 1 FROM public.team_members tm1
          WHERE tm1.user_id = c.uid AND tm1.member_type = 'coach'
            AND tm1.is_active = true AND tm1.deleted_at IS NULL
        ))
        OR (p_role_filter = 'player' AND EXISTS (
          SELECT 1 FROM public.team_members tm2
          WHERE tm2.user_id = c.uid AND tm2.member_type = 'player'
            AND tm2.is_active = true AND tm2.deleted_at IS NULL
        ))
        OR (p_role_filter = 'supporter' AND EXISTS (
          SELECT 1 FROM public.supporters_link sl0
          WHERE sl0.supporter_id = c.uid
        ))
      )
      AND (
        p_club_filter IS NULL
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur4
          WHERE ur4.user_id = c.uid AND ur4.club_id = p_club_filter
        )
        OR EXISTS (
          SELECT 1 FROM public.team_members tm3
          JOIN public.teams t1 ON t1.id = tm3.team_id
          WHERE tm3.user_id = c.uid AND tm3.is_active = true
            AND tm3.deleted_at IS NULL AND t1.club_id = p_club_filter
        )
      )
      AND (p_coach_filter IS NULL OR c.uid = p_coach_filter)
      AND (p_player_filter IS NULL OR c.uid = p_player_filter)
  ),
  counted AS (
    SELECT f.uid, f.ref_created, COUNT(*) OVER () AS tc FROM filtered f
  )
  SELECT counted.uid, counted.tc
  FROM counted
  ORDER BY counted.ref_created DESC NULLS LAST, counted.uid
  OFFSET v_offset
  LIMIT v_size;
END
$body$;