-- F4 — Soft-delete officiel pour evaluations + DELETE explicite bloqué
-- Le frontend utilise déjà UPDATE deleted_at pour archiver les débriefs.
-- Cette migration verrouille la base pour transformer tout DELETE direct
-- (silent swallow actuel) en erreur explicite — défense en profondeur.

-- 1. La colonne deleted_at existe déjà — ALTER IF NOT EXISTS de sécurité
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Index partiel pour perfs SELECT filtrés (player_id + date desc, actives uniquement)
CREATE INDEX IF NOT EXISTS idx_evaluations_active
  ON public.evaluations (player_id, date DESC) WHERE deleted_at IS NULL;

-- 3. Trigger BEFORE DELETE — défense en profondeur + erreur explicite
CREATE OR REPLACE FUNCTION public.prevent_evaluation_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role peut hard-delete (jobs RGPD/purge, ex: purge_old_evaluations)
  IF auth.role() = 'service_role' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Hard delete on evaluations is forbidden. Use UPDATE deleted_at = now() instead.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_evaluation_hard_delete ON public.evaluations;
CREATE TRIGGER trg_prevent_evaluation_hard_delete
  BEFORE DELETE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_evaluation_hard_delete();