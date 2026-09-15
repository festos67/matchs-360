-- =====================================================================
-- Page coach « Mon club » : encart du club avec le nombre d'utilisateurs.
--
-- Ajoute total_users = personnes DISTINCTES rattachees au club : joueurs et
-- coachs actifs des equipes, supporters de ces joueurs, responsables du club.
-- Une personne qui cumule plusieurs roles n'est comptee qu'une fois.
--
-- A distinguer du KPI « Utilisateurs (app) » du tableau de bord responsable
-- club, qui compte tous les profils de l'application sans filtre de club.
--
-- Changer le type de retour impose DROP + CREATE (CREATE OR REPLACE refuse).
-- Seul CoachMyClub appelle cette fonction.
--
-- Durcissement au passage : la fonction est SECURITY DEFINER et acceptait un
-- p_user_id arbitraire — n'importe quel compte connecte pouvait obtenir les
-- effectifs de n'importe quel club au nom de n'importe qui. Le front passe
-- toujours l'utilisateur courant ; un appel pour autrui renvoie desormais des
-- zeros (doctrine anti-oracle F-205 du projet).
--
-- Verifie apres application sur le club TEST : total_users = 26, egal au
-- calcul independant ; un autre compte interrogeant au nom du coach obtient 0.
-- =====================================================================
DROP FUNCTION IF EXISTS public.get_coach_my_club_dashboard_stats(uuid, uuid);

CREATE FUNCTION public.get_coach_my_club_dashboard_stats(p_user_id uuid, p_club_id uuid)
RETURNS TABLE(
  my_teams integer,
  my_players integer,
  my_supporters integer,
  total_teams integer,
  total_coaches integer,
  total_players integer,
  total_supporters integer,
  total_users integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective_club AS (
    SELECT public.get_coach_effective_club_id(p_user_id, p_club_id) AS club_id
    WHERE p_user_id = auth.uid()
  ),
  active_teams AS (
    SELECT t.id
    FROM public.teams t
    JOIN public.clubs c ON c.id = t.club_id
    JOIN effective_club ec ON ec.club_id = t.club_id
    WHERE t.deleted_at IS NULL
      AND c.deleted_at IS NULL
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
      JOIN effective_club ec ON ec.club_id = ur.club_id
      WHERE ur.role = 'coach'
    ) c
    WHERE coach_id IS NOT NULL
  ),
  club_supporters AS (
    SELECT DISTINCT sl.supporter_id
    FROM public.supporters_link sl
    JOIN club_players cp ON cp.player_id = sl.player_id
  ),
  club_admins AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    JOIN effective_club ec ON ec.club_id = ur.club_id
    WHERE ur.role = 'club_admin'
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
    (SELECT count(*)::int FROM club_supporters) AS total_supporters,
    (SELECT count(DISTINCT u)::int FROM (
       SELECT player_id AS u FROM club_players
       UNION SELECT coach_id FROM club_coaches
       UNION SELECT supporter_id FROM club_supporters
       UNION SELECT user_id FROM club_admins
     ) everyone) AS total_users
$function$;

REVOKE EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_my_club_dashboard_stats(uuid, uuid) TO service_role;
