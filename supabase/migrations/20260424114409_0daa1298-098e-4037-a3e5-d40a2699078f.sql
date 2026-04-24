-- Idempotence guarantee: one active evaluation per (evaluator, player, date, type).
-- Excludes soft-deleted rows so a deleted eval can be recreated.
CREATE UNIQUE INDEX IF NOT EXISTS evaluations_unique_per_day_idx
  ON public.evaluations (evaluator_id, player_id, date, type)
  WHERE deleted_at IS NULL;