BEGIN;

-- =====================================================================
-- RG3-002 + I2-001 — purge_old_minor_evaluations : critère "parti > 3 ans
-- et était mineur au départ" + verrouillage exécution (service_role/admin).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.purge_old_minor_evaluations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_evals_count int;
  v_scores_count int;
BEGIN
  -- I2-001 : seul le cron (service_role) ou un admin peut declencher
  -- une anonymisation IRREVERSIBLE. Bloque les comptes authenticated/anon.
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: minor retention purge requires service_role or admin'
      USING ERRCODE = '42501';
  END IF;

  -- RG3-002 : un "ex-mineur a anonymiser" est un joueur qui (1) avait
  -- une birthdate connue, (2) n'a plus AUCUN team_member actif,
  -- (3) son DERNIER depart d'equipe (MAX(left_at)) est > 3 ans,
  -- (4) etait mineur au moment de ce dernier depart (birthdate >
  --     MAX(left_at) - 18 ans). On NE filtre PAS sur l'age courant :
  -- la cible est precisement les anciens mineurs devenus majeurs.
  WITH eligible_players AS (
    SELECT p.id AS player_id
    FROM public.profiles p
    WHERE p.birthdate IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = p.id AND tm.is_active = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm2
        WHERE tm2.user_id = p.id
        GROUP BY tm2.user_id
        HAVING MAX(tm2.left_at) IS NOT NULL
           AND MAX(tm2.left_at) < (now() - INTERVAL '3 years')
           AND p.birthdate > (MAX(tm2.left_at)::date - INTERVAL '18 years')
      )
  ),
  upd AS (
    UPDATE public.evaluations e
    SET notes = '[Archive anonymisee - retention 3 ans]'
    WHERE e.notes IS NOT NULL
      AND e.notes <> '[Archive anonymisee - retention 3 ans]'
      AND e.player_id IN (SELECT player_id FROM eligible_players)
    RETURNING 1
  )
  SELECT count(*) INTO v_evals_count FROM upd;

  WITH eligible_players AS (
    SELECT p.id AS player_id
    FROM public.profiles p
    WHERE p.birthdate IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = p.id AND tm.is_active = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm2
        WHERE tm2.user_id = p.id
        GROUP BY tm2.user_id
        HAVING MAX(tm2.left_at) IS NOT NULL
           AND MAX(tm2.left_at) < (now() - INTERVAL '3 years')
           AND p.birthdate > (MAX(tm2.left_at)::date - INTERVAL '18 years')
      )
  ),
  upd2 AS (
    UPDATE public.evaluation_scores es
    SET comment = '[Archive anonymisee - retention 3 ans]'
    FROM public.evaluations e
    WHERE es.evaluation_id = e.id
      AND es.comment IS NOT NULL
      AND es.comment <> '[Archive anonymisee - retention 3 ans]'
      AND e.player_id IN (SELECT player_id FROM eligible_players)
    RETURNING 1
  )
  SELECT count(*) INTO v_scores_count FROM upd2;

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
    RAISE WARNING
      'audit_log insert failed in purge_old_minor_evaluations (SQLSTATE=%): %',
      SQLSTATE, SQLERRM;
  END;
END;
$function$;

-- I2-001 : retirer les EXECUTE laisses a anon/authenticated.
REVOKE ALL ON FUNCTION public.purge_old_minor_evaluations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_minor_evaluations() TO service_role;

COMMENT ON FUNCTION public.purge_old_minor_evaluations() IS
  'RG3-002 + I2-001 : anonymise (UPDATE, jamais DELETE) les evaluations
   des anciens mineurs ayant quitte toutes leurs equipes depuis > 3 ans,
   et qui etaient mineurs au moment de leur dernier depart.
   Execution restreinte au service_role / admin (anonymisation irreversible).';

-- =====================================================================
-- RG3-003 — planifier purge_old_invitations (quotidien 04:00 UTC).
-- =====================================================================
DO $$
DECLARE
  v_id bigint;
BEGIN
  FOR v_id IN SELECT jobid FROM cron.job WHERE jobname = 'purge-old-invitations-daily'
  LOOP
    PERFORM cron.unschedule(v_id);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'purge-old-invitations-daily',
  '0 4 * * *',
  'SELECT public.purge_old_invitations();'
);

-- =====================================================================
-- Nettoyage : supprimer le cron doublon 'purge-old-evaluations' (hebdo).
-- On conserve 'evaluations-purge-daily' (quotidien) qui fait deja le job.
-- =====================================================================
DO $$
DECLARE
  v_id bigint;
BEGIN
  FOR v_id IN SELECT jobid FROM cron.job WHERE jobname = 'purge-old-evaluations'
  LOOP
    PERFORM cron.unschedule(v_id);
  END LOOP;
END
$$;

COMMIT;