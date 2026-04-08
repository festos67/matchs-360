
-- Create framework_snapshots table
CREATE TABLE public.framework_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one snapshot per framework version
ALTER TABLE public.framework_snapshots
  ADD CONSTRAINT unique_snapshot_per_framework UNIQUE(framework_id);

-- Index for fast lookup
CREATE INDEX idx_framework_snapshots_framework_id ON public.framework_snapshots(framework_id);

-- Enable RLS
ALTER TABLE public.framework_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to framework_snapshots"
ON public.framework_snapshots FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Club admin manage snapshots for their club's frameworks
CREATE POLICY "Club admin manage framework_snapshots"
ON public.framework_snapshots FOR ALL TO authenticated
USING (
  framework_id IN (
    SELECT id FROM competence_frameworks
    WHERE club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
)
WITH CHECK (
  framework_id IN (
    SELECT id FROM competence_frameworks
    WHERE club_id IN (SELECT get_user_club_admin_ids(auth.uid()))
  )
);

-- Coaches can read/create snapshots for their team frameworks
CREATE POLICY "Coaches manage framework_snapshots for their teams"
ON public.framework_snapshots FOR ALL TO authenticated
USING (
  framework_id IN (
    SELECT id FROM competence_frameworks
    WHERE team_id IN (SELECT get_user_team_ids(auth.uid()))
  )
)
WITH CHECK (
  framework_id IN (
    SELECT id FROM competence_frameworks
    WHERE team_id IN (SELECT get_user_team_ids(auth.uid()))
  )
);

-- Players can read snapshots linked to their evaluations
CREATE POLICY "Players view framework_snapshots via evaluations"
ON public.framework_snapshots FOR SELECT TO authenticated
USING (
  framework_id IN (
    SELECT framework_id FROM evaluations WHERE player_id = auth.uid()
  )
);

-- Supporters can read snapshots linked to their players' evaluations
CREATE POLICY "Supporters view framework_snapshots"
ON public.framework_snapshots FOR SELECT TO authenticated
USING (
  framework_id IN (
    SELECT e.framework_id FROM evaluations e
    WHERE is_supporter_of_player(auth.uid(), e.player_id)
      AND e.type != 'self'
  )
);
