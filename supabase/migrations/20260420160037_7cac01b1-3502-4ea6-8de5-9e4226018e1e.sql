CREATE TABLE public.plan_limits (
  plan public.subscription_plan PRIMARY KEY,
  max_teams INTEGER NOT NULL,
  max_players_per_team INTEGER NOT NULL,
  max_coaches_per_team INTEGER NOT NULL,
  max_coach_evals_per_player INTEGER NOT NULL,
  max_self_evals_per_player INTEGER NOT NULL,
  max_supporter_evals_per_player INTEGER NOT NULL,
  max_supporters_per_team INTEGER NOT NULL,
  max_objectives_per_player INTEGER NOT NULL,
  max_team_objectives INTEGER NOT NULL,
  can_export_pdf BOOLEAN NOT NULL DEFAULT false,
  can_compare_multi_source BOOLEAN NOT NULL DEFAULT false,
  can_version_framework BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO public.plan_limits (
  plan, max_teams, max_players_per_team, max_coaches_per_team,
  max_coach_evals_per_player, max_self_evals_per_player, max_supporter_evals_per_player,
  max_supporters_per_team, max_objectives_per_player, max_team_objectives,
  can_export_pdf, can_compare_multi_source, can_version_framework
) VALUES
  ('free', 2, 25, 1, 3, 3, 1, 5, 3, 3, false, false, false),
  ('pro', 999, 999, 999, 30, 10, 10, 999, 999, 999, true, true, true);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plan limits"
  ON public.plan_limits FOR SELECT TO authenticated
  USING (true);