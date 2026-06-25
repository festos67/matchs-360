
create or replace function public.get_club_overview_stats(p_club_id uuid)
returns table(
  total_teams int,
  total_coaches int,
  total_players int,
  total_supporters int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.teams t
       where t.club_id = p_club_id and t.deleted_at is null) as total_teams,
    (select count(distinct ur.user_id)::int from public.user_roles ur
       where ur.club_id = p_club_id and ur.role = 'coach') as total_coaches,
    (select count(distinct ur.user_id)::int from public.user_roles ur
       where ur.club_id = p_club_id and ur.role = 'player') as total_players,
    (select count(distinct ur.user_id)::int from public.user_roles ur
       where ur.club_id = p_club_id and ur.role = 'supporter') as total_supporters
$$;

grant execute on function public.get_club_overview_stats(uuid) to authenticated;

create or replace function public.get_coach_personal_stats(p_user_id uuid, p_club_id uuid)
returns table(
  my_teams int,
  my_players int,
  my_supporters int
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.get_coach_personal_stats(uuid, uuid) to authenticated;
