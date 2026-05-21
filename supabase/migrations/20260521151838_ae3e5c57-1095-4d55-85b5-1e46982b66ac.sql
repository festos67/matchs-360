BEGIN;

-- ============================================================================
-- BUG-SQL-002 + classe C2-001 : audit_log.action ne doit plus être un piège.
-- 1) Relâcher le CHECK figé → CHECK de sanité (non vide, 1..64 chars).
-- 2) Rendre l'écriture audit défensive dans purge_old_minor_evaluations
--    (un log raté ne doit PAS faire rollback l'anonymisation RGPD).
-- audit_log reste APPEND-ONLY (RLS UPDATE/DELETE interdits, inchangés).
-- ============================================================================

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_action_sane;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_action_sane
  CHECK (action IS NOT NULL AND length(action) BETWEEN 1 AND 64);

COMMENT ON CONSTRAINT audit_log_action_sane ON public.audit_log IS
  'BUG-SQL-002 / classe C2-001 : contrainte de sanité (non vide, <= 64 chars). '
  'On NE fige PAS la liste des actions : un CHECK trop restrictif a déjà causé '
  '2 régressions (plan_limit_bypassed, minor_retention_purge) en faisant rollback '
  'des opérations métier critiques (RGPD). La valeur forensic du label vient de '
  'la donnée tracée, pas d''une énumération figée.';

-- ----------------------------------------------------------------------------
-- Recréer purge_old_minor_evaluations avec sous-bloc EXCEPTION défensif
-- autour de l'INSERT audit_log. Un échec de log → RAISE WARNING (observable
-- dans les logs Postgres), JAMAIS un rollback de l'anonymisation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_minor_evaluations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evals_count int;
  v_scores_count int;
BEGIN
  WITH upd AS (
    UPDATE public.evaluations e
    SET notes = '[Archive anonymisee - retention 3 ans]'
    WHERE e.notes IS NOT NULL
      AND e.notes <> '[Archive anonymisee - retention 3 ans]'
      AND public.is_minor(e.player_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = e.player_id
          AND (
            tm.is_active = true
            OR (tm.left_at IS NOT NULL AND tm.left_at > (CURRENT_DATE - INTERVAL '3 years'))
            OR (tm.left_at IS NULL AND tm.is_active = false)
          )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_evals_count FROM upd;

  WITH upd2 AS (
    UPDATE public.evaluation_scores es
    SET comment = '[Archive anonymisee - retention 3 ans]'
    FROM public.evaluations e
    WHERE es.evaluation_id = e.id
      AND es.comment IS NOT NULL
      AND es.comment <> '[Archive anonymisee - retention 3 ans]'
      AND public.is_minor(e.player_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = e.player_id
          AND (
            tm.is_active = true
            OR (tm.left_at IS NOT NULL AND tm.left_at > (CURRENT_DATE - INTERVAL '3 years'))
            OR (tm.left_at IS NULL AND tm.is_active = false)
          )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_scores_count FROM upd2;

  -- Sous-bloc défensif : un log raté ne casse PAS l'anonymisation RGPD.
  BEGIN
    INSERT INTO public.audit_log (actor_role, action, table_name, after_data)
    VALUES (
      'system',
      'minor_retention_purge',
      'evaluations',
      jsonb_build_object(
        'evaluations_anonymized', v_evals_count,
        'scores_anonymized', v_scores_count,
        'ran_at', now()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- NE PAS utiliser THEN NULL (masquerait les bugs).
    -- RAISE WARNING garde une trace observable sans annuler l'opération.
    RAISE WARNING
      'audit_log insert failed in purge_old_minor_evaluations (SQLSTATE=%): %',
      SQLSTATE, SQLERRM;
  END;
END;
$$;

COMMENT ON FUNCTION public.purge_old_minor_evaluations() IS
  'Phase 6 RGPD mineurs (A2-015) : rétention 3 ans. Anonymise (sans supprimer) '
  'les commentaires nominatifs des évaluations de mineurs ayant quitté le club '
  'depuis plus de 3 ans. À programmer mensuellement. '
  'BUG-SQL-002 : l''écriture audit_log est défensive — un log raté n''annule '
  'jamais l''anonymisation (RAISE WARNING, pas rollback).';

COMMIT;