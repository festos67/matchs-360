create or replace function public.get_admin_dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'clubs',             (select count(*) from public.clubs where deleted_at is null),
    'teams',             (select count(*) from public.teams where deleted_at is null),
    'players',           (select count(*) from public.user_roles where role = 'player'),
    'users',             (select count(*) from public.profiles where deleted_at is null),
    'evaluations',       (select count(*) from public.evaluations where deleted_at is null),
    'needing_birthdate', (select count(*) from public.profiles_needing_birthdate),
    'avg_score',         (select round(avg(score)::numeric, 2) from public.evaluation_scores
                            where deleted_at is null and score is not null and score > 0)
  );
$$;

revoke execute on function public.get_admin_dashboard_stats() from public, anon;
grant execute on function public.get_admin_dashboard_stats() to authenticated;