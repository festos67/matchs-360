create table if not exists public.self_evaluation_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  evaluation_id uuid references public.evaluations(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint self_evaluation_requests_status_check check (status in ('pending','completed','cancelled'))
);

create unique index if not exists self_evaluation_requests_one_pending_per_player
  on public.self_evaluation_requests (player_id) where status = 'pending';
create index if not exists self_evaluation_requests_player_idx
  on public.self_evaluation_requests (player_id);
create index if not exists self_evaluation_requests_requested_by_idx
  on public.self_evaluation_requests (requested_by);

grant select, insert, update, delete on public.self_evaluation_requests to authenticated;
grant all on public.self_evaluation_requests to service_role;

alter table public.self_evaluation_requests enable row level security;

create policy "Admins have full access to self evaluation requests"
  on public.self_evaluation_requests for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy "Club admins can manage self evaluation requests"
  on public.self_evaluation_requests for all
  using (is_club_admin(auth.uid(), get_player_club_id(player_id)))
  with check (is_club_admin(auth.uid(), get_player_club_id(player_id)));

create policy "Coaches can create self evaluation requests"
  on public.self_evaluation_requests for insert
  with check (
    (requested_by = auth.uid()) and (exists (
      select 1 from team_members tm1
      join team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid() and tm1.member_type = 'coach' and tm1.is_active = true
        and tm2.user_id = self_evaluation_requests.player_id and tm2.member_type = 'player' and tm2.is_active = true
    ))
  );

create policy "Coaches can view their self evaluation requests"
  on public.self_evaluation_requests for select using (requested_by = auth.uid());
create policy "Coaches can update their self evaluation requests"
  on public.self_evaluation_requests for update using (requested_by = auth.uid());

create policy "Players can view their own self evaluation requests"
  on public.self_evaluation_requests for select using (player_id = auth.uid());
create policy "Players can update their own self evaluation requests"
  on public.self_evaluation_requests for update
  using (player_id = auth.uid()) with check (player_id = auth.uid());

create policy "restrict_inactive_account"
  on public.self_evaluation_requests as restrictive for all
  using (current_account_active()) with check (current_account_active());