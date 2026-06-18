
-- Performance indexes for the most frequent slow queries (sidebar menu loads)

-- team_members: heavily filtered by (team_id, member_type, is_active) and by user_id
CREATE INDEX IF NOT EXISTS idx_team_members_team_type_active
  ON public.team_members (team_id, member_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_user_type_active
  ON public.team_members (user_id, member_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_team_coach_role
  ON public.team_members (team_id, coach_role)
  WHERE member_type = 'coach' AND is_active = true AND deleted_at IS NULL;

-- evaluation_scores: lookups by evaluation_id
CREATE INDEX IF NOT EXISTS idx_evaluation_scores_evaluation
  ON public.evaluation_scores (evaluation_id)
  WHERE deleted_at IS NULL;

-- evaluations: by player_id ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_evaluations_player_created
  ON public.evaluations (player_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- teams: by club_id (filtered active)
CREATE INDEX IF NOT EXISTS idx_teams_club_active
  ON public.teams (club_id)
  WHERE deleted_at IS NULL;

-- themes / skills (framework loading)
CREATE INDEX IF NOT EXISTS idx_themes_framework_order
  ON public.themes (framework_id, order_index);

CREATE INDEX IF NOT EXISTS idx_skills_theme
  ON public.skills (theme_id);

-- user_roles: scan by role (admin lookups)
CREATE INDEX IF NOT EXISTS idx_user_roles_role
  ON public.user_roles (role);

CREATE INDEX IF NOT EXISTS idx_user_roles_user
  ON public.user_roles (user_id);

-- competence_frameworks: club templates listing
CREATE INDEX IF NOT EXISTS idx_competence_frameworks_club_template
  ON public.competence_frameworks (club_id, is_template, is_archived);

-- supporters_link: lookups by player and by supporter
CREATE INDEX IF NOT EXISTS idx_supporters_link_player
  ON public.supporters_link (player_id);

CREATE INDEX IF NOT EXISTS idx_supporters_link_supporter
  ON public.supporters_link (supporter_id);

ANALYZE public.team_members;
ANALYZE public.teams;
ANALYZE public.evaluation_scores;
ANALYZE public.evaluations;
ANALYZE public.themes;
ANALYZE public.skills;
ANALYZE public.user_roles;
ANALYZE public.competence_frameworks;
ANALYZE public.supporters_link;
