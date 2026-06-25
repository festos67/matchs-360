CREATE OR REPLACE FUNCTION public.get_club_overview_stats(p_club_id uuid)
RETURNS TABLE(total_teams integer, total_coaches integer, total_players integer, total_supporters integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with active_teams as (
    select id from public.teams
    where club_id = p_club_id and deleted_at is null
  ),
  club_players as (
    select distinct tm.user_id as player_id
    from public.team_members tm
    where tm.team_id in (select id from active_teams)
      and tm.member_type = 'player'
      and tm.is_active = true
      and tm.user_id is not null
  ),
  club_coaches as (
    -- Union team_members coachs + user_roles coachs (couverture maximale)
    select distinct user_id from (
      select tm.user_id
        from public.team_members tm
        where tm.team_id in (select id from active_teams)
          and tm.member_type = 'coach'
          and tm.is_active = true
          and tm.user_id is not null
      union
      select ur.user_id
        from public.user_roles ur
        where ur.club_id = p_club_id and ur.role = 'coach'
    ) c
  )
  select
    (select count(*)::int from active_teams) as total_teams,
    (select count(*)::int from club_coaches) as total_coaches,
    (select count(*)::int from club_players) as total_players,
    (select count(distinct sl.supporter_id)::int
       from public.supporters_link sl
       where sl.player_id in (select player_id from club_players)) as total_supporters
$function$;

CREATE OR REPLACE FUNCTION public.get_coach_personal_stats(p_user_id uuid, p_club_id uuid)
RETURNS TABLE(my_teams integer, my_players integer, my_supporters integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with my_team_ids as (
    select distinct tm.team_id
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = p_user_id
      and tm.member_type = 'coach'
      and tm.is_active = true
      and t.club_id = p_club_id
      and t.deleted_at is null
  ),
  my_player_ids as (
    select distinct tm.user_id as player_id
    from public.team_members tm
    where tm.team_id in (select team_id from my_team_ids)
      and tm.member_type = 'player'
      and tm.is_active = true
      and tm.user_id is not null
  )
  select
    (select count(*)::int from my_team_ids) as my_teams,
    (select count(*)::int from my_player_ids) as my_players,
    (select count(distinct sl.supporter_id)::int
       from public.supporters_link sl
       where sl.player_id in (select player_id from my_player_ids)) as my_supporters
$function$;