CREATE OR REPLACE FUNCTION public.get_club_overview_stats(p_club_id uuid)
RETURNS TABLE(total_teams integer, total_coaches integer, total_players integer, total_supporters integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH active_teams AS (
    SELECT t.id
    FROM public.teams t
    WHERE t.club_id = p_club_id
      AND t.deleted_at IS NULL
  ),
  club_players AS (
    SELECT DISTINCT tm.user_id AS player_id
    FROM public.team_members tm
    JOIN active_teams at ON at.id = tm.team_id
    WHERE tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND tm.user_id IS NOT NULL
  ),
  club_coaches AS (
    SELECT DISTINCT coach_id
    FROM (
      SELECT tm.user_id AS coach_id
      FROM public.team_members tm
      JOIN active_teams at ON at.id = tm.team_id
      WHERE tm.member_type = 'coach'
        AND tm.is_active = true
        AND tm.deleted_at IS NULL
        AND tm.user_id IS NOT NULL
      UNION
      SELECT ur.user_id AS coach_id
      FROM public.user_roles ur
      WHERE ur.club_id = p_club_id
        AND ur.role = 'coach'
    ) c
    WHERE coach_id IS NOT NULL
  )
  SELECT
    (SELECT count(*)::int FROM active_teams) AS total_teams,
    (SELECT count(*)::int FROM club_coaches) AS total_coaches,
    (SELECT count(*)::int FROM club_players) AS total_players,
    (SELECT count(DISTINCT sl.supporter_id)::int
     FROM public.supporters_link sl
     JOIN club_players cp ON cp.player_id = sl.player_id) AS total_supporters
$function$;

GRANT EXECUTE ON FUNCTION public.get_club_overview_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_club_overview_stats(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_coach_personal_stats(p_user_id uuid, p_club_id uuid)
RETURNS TABLE(my_teams integer, my_players integer, my_supporters integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH my_team_ids AS (
    SELECT DISTINCT tm.team_id
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = p_user_id
      AND tm.member_type = 'coach'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND t.club_id = p_club_id
      AND t.deleted_at IS NULL
  ),
  my_player_ids AS (
    SELECT DISTINCT tm.user_id AS player_id
    FROM public.team_members tm
    JOIN my_team_ids mt ON mt.team_id = tm.team_id
    WHERE tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND tm.user_id IS NOT NULL
  )
  SELECT
    (SELECT count(*)::int FROM my_team_ids) AS my_teams,
    (SELECT count(*)::int FROM my_player_ids) AS my_players,
    (SELECT count(DISTINCT sl.supporter_id)::int
     FROM public.supporters_link sl
     JOIN my_player_ids mp ON mp.player_id = sl.player_id) AS my_supporters
$function$;

GRANT EXECUTE ON FUNCTION public.get_coach_personal_stats(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_personal_stats(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_coach_my_club_dashboard_stats(p_user_id uuid, p_club_id uuid)
RETURNS TABLE(
  my_teams integer,
  my_players integer,
  my_supporters integer,
  total_teams integer,
  total_coaches integer,
  total_players integer,
  total_supporters integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH active_teams AS (
    SELECT t.id
    FROM public.teams t
    WHERE t.club_id = p_club_id
      AND t.deleted_at IS NULL
  ),
  my_team_ids AS (
    SELECT DISTINCT tm.team_id
    FROM public.team_members tm
    JOIN active_teams at ON at.id = tm.team_id
    WHERE tm.user_id = p_user_id
      AND tm.member_type = 'coach'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
  ),
  club_players AS (
    SELECT DISTINCT tm.user_id AS player_id
    FROM public.team_members tm
    JOIN active_teams at ON at.id = tm.team_id
    WHERE tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND tm.user_id IS NOT NULL
  ),
  my_players AS (
    SELECT DISTINCT tm.user_id AS player_id
    FROM public.team_members tm
    JOIN my_team_ids mt ON mt.team_id = tm.team_id
    WHERE tm.member_type = 'player'
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND tm.user_id IS NOT NULL
  ),
  club_coaches AS (
    SELECT DISTINCT coach_id
    FROM (
      SELECT tm.user_id AS coach_id
      FROM public.team_members tm
      JOIN active_teams at ON at.id = tm.team_id
      WHERE tm.member_type = 'coach'
        AND tm.is_active = true
        AND tm.deleted_at IS NULL
        AND tm.user_id IS NOT NULL
      UNION
      SELECT ur.user_id AS coach_id
      FROM public.user_roles ur
      WHERE ur.club_id = p_club_id
        AND ur.role = 'coach'
    ) c
    WHERE coach_id IS NOT NULL
  )
  SELECT
    (SELECT count(*)::int FROM my_team_ids) AS my_teams,
    (SELECT count(*)::int FROM my_players) AS my_players,
    (SELECT count(DISTINCT sl.supporter_id)::int
     FROM public.supporters_link sl
     JOIN my_players mp ON mp.player_id = sl.player_id) AS my_supporters,
    (SELECT count(*)::int FROM active_teams) AS total_teams,
    (SELECT count(*)::int FROM club_coaches) AS total_coaches,
    (SELECT count(*)::int FROM club_players) AS total_players,
    (SELECT count(DISTINCT sl.supporter_id)::int
     FROM public.supporters_link sl
     JOIN club_players cp ON cp.player_id = sl.player_id) AS total_supporters
$function$;

GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_team_members_active_team_type_user
  ON public.team_members (team_id, member_type, user_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_active_user_type_team
  ON public.team_members (user_id, member_type, team_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_club_role_user
  ON public.user_roles (club_id, role, user_id);

CREATE INDEX IF NOT EXISTS idx_supporters_link_player_supporter
  ON public.supporters_link (player_id, supporter_id);