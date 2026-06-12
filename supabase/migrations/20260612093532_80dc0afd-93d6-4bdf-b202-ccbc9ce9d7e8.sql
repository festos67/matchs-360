ALTER TABLE public.evaluation_scores ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.evaluation_objectives ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS evaluation_scores_deleted_at_idx ON public.evaluation_scores(deleted_at);
CREATE INDEX IF NOT EXISTS evaluation_objectives_deleted_at_idx ON public.evaluation_objectives(deleted_at);
ALTER TABLE public.evaluation_scores DROP CONSTRAINT IF EXISTS evaluation_scores_evaluation_id_skill_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_scores_evaluation_id_skill_id_active_key
  ON public.evaluation_scores(evaluation_id, skill_id)
  WHERE deleted_at IS NULL;