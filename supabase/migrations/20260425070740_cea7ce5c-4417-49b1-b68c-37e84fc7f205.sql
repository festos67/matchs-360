-- =====================================================================
-- F-206 (2026-04-25) : Retrait du bypass implicite super-admin dans
-- get_club_plan + introduction d'un bypass EXPLICITE et TRACÉ via GUC.
-- =====================================================================
-- Problème : get_club_plan() retournait 'pro' pour tout super-admin
-- caller, ce qui faisait sauter silencieusement TOUS les triggers de
-- limites de plan (teams, members, supporters, objectives, evaluations).
-- Conséquence : un super-admin pouvait créer des entités hors-quota
-- dans un club Free sans aucune trace dans audit_log → bypass invisible
-- et incohérence facturation/usage.
--
-- Fix :
--  1. get_club_plan() retourne le VRAI plan du club, sans bypass caller
--  2. is_plan_bypass_active() : helper bypass EXPLICITE
--     - exige auth.role() = 'service_role'
--     - exige GUC app.bypass_plan_limits = 'true' positionné
--       explicitement par SET LOCAL au début d'une tx maintenance
--  3. Triggers check_*_limit : consultent is_plan_bypass_active() AVANT
--     d'appliquer la limite ; si bypass actif → INSERT dans audit_log
--     avec action='plan_limit_bypassed' (forensic).
--
-- Idempotent : CREATE OR REPLACE partout.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1 : get_club_plan retourne le VRAI plan, sans bypass caller
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_club_plan(p_club_id uuid)
 RETURNS public.subscription_plan
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- F-206 (2026-04-25) : retourne UNIQUEMENT le plan réel du club.
  -- Le bypass caller (anciennement IF is_admin THEN 'pro') a été retiré
  -- car il faisait sauter les limites de plan de manière silencieuse.
  -- Le bypass légitime de quota passe désormais par le GUC
  -- app.bypass_plan_limits via is_plan_bypass_active(), tracé dans
  -- audit_log par les triggers de limite eux-mêmes.
  SELECT COALESCE(
    (
      SELECT plan FROM public.subscriptions
      WHERE club_id = p_club_id
        AND starts_at <= CURRENT_DATE
        AND ends_at >= CURRENT_DATE
      ORDER BY
        CASE plan WHEN 'pro' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ),
    'free'::public.subscription_plan
  );
$function$;

COMMENT ON FUNCTION public.get_club_plan(uuid) IS
  'F-206 fix (2026-04-25): retourne le plan reel du club, sans bypass selon le caller. Le bypass de limites passe par le GUC app.bypass_plan_limits + service_role, trace dans audit_log.';

-- ---------------------------------------------------------------------
-- STEP 2 : Helper bypass explicite
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_plan_bypass_active()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flag text;
BEGIN
  -- F-206 : bypass autorise UNIQUEMENT si :
  --   (a) caller est service_role (impossible cote JWT user)
  --   (b) GUC app.bypass_plan_limits explicitement positionne a 'true'
  --       par SET LOCAL au debut d'une transaction de maintenance.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN false;
  END IF;

  BEGIN
    v_flag := current_setting('app.bypass_plan_limits', true);
  EXCEPTION WHEN OTHERS THEN
    v_flag := NULL;
  END;

  RETURN v_flag IS NOT NULL AND lower(v_flag) = 'true';
END;
$function$;

COMMENT ON FUNCTION public.is_plan_bypass_active() IS
  'F-206 (2026-04-25): bypass explicite des limites de plan, reserve aux transactions service_role qui ont positionne SET LOCAL app.bypass_plan_limits=''true''.';

REVOKE EXECUTE ON FUNCTION public.is_plan_bypass_active() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_plan_bypass_active() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- STEP 3 : Helper de tracage du bypass dans audit_log (forensic)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._log_plan_limit_bypass(
  p_table text,
  p_limit_kind text,
  p_club_id uuid,
  p_record_id text
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Trace systematique de chaque bypass pour audit forensic.
  INSERT INTO public.audit_log (
    actor_id, actor_role, action, table_name, record_id, after_data
  ) VALUES (
    auth.uid(),
    COALESCE(auth.role(), 'service_role'),
    'plan_limit_bypassed',
    p_table,
    p_record_id,
    jsonb_build_object(
      'limit_kind', p_limit_kind,
      'club_id', p_club_id,
      'bypassed_at', now()
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- L'audit_log ne doit jamais bloquer une operation legitime.
  NULL;
END;
$function$;

-- ---------------------------------------------------------------------
-- STEP 4 : Re-creation des triggers check_*_limit avec bypass explicite
-- ---------------------------------------------------------------------

-- 4.1 check_team_limit
CREATE OR REPLACE FUNCTION public.check_team_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  IF public.is_plan_bypass_active() THEN
    PERFORM public._log_plan_limit_bypass('teams', 'max_teams', NEW.club_id, NEW.id::text);
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(NEW.club_id) INTO v_plan;
  SELECT max_teams INTO v_limit FROM public.plan_limits WHERE plan = v_plan;

  SELECT COUNT(*) INTO v_count
  FROM public.teams
  WHERE club_id = NEW.club_id AND deleted_at IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_TEAMS:Limite du plan % atteinte : % équipes maximum.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4.2 check_member_limit
CREATE OR REPLACE FUNCTION public.check_member_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id UUID;
  v_plan public.subscription_plan;
  v_limits RECORD;
  v_count INTEGER;
BEGIN
  SELECT club_id INTO v_club_id FROM public.teams WHERE id = NEW.team_id;

  IF public.is_plan_bypass_active() THEN
    PERFORM public._log_plan_limit_bypass('team_members', 'max_'||NEW.member_type||'s_per_team', v_club_id, NEW.id::text);
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_plan;

  IF NEW.member_type = 'player' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.team_members
    WHERE team_id = NEW.team_id
      AND member_type = 'player'
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_count >= v_limits.max_players_per_team THEN
      RAISE EXCEPTION 'PLAN_LIMIT_PLAYERS:Limite du plan % atteinte : % joueurs par équipe maximum.', v_plan, v_limits.max_players_per_team;
    END IF;

  ELSIF NEW.member_type = 'coach' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.team_members
    WHERE team_id = NEW.team_id
      AND member_type = 'coach'
      AND is_active = true
      AND deleted_at IS NULL;

    IF v_count >= v_limits.max_coaches_per_team THEN
      RAISE EXCEPTION 'PLAN_LIMIT_COACHES:Limite du plan % atteinte : % coach(s) par équipe maximum. Passez en Pro pour ajouter des coachs assistants.', v_plan, v_limits.max_coaches_per_team;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4.3 check_supporter_limit
CREATE OR REPLACE FUNCTION public.check_supporter_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id UUID;
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
  v_team_id UUID;
BEGIN
  SELECT t.club_id, t.id INTO v_club_id, v_team_id
  FROM public.team_members tm
  JOIN public.teams t ON tm.team_id = t.id
  WHERE tm.user_id = NEW.player_id
    AND tm.member_type = 'player'
    AND tm.is_active = true
    AND tm.deleted_at IS NULL
  LIMIT 1;

  IF v_club_id IS NULL OR v_team_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_plan_bypass_active() THEN
    PERFORM public._log_plan_limit_bypass('supporters_link', 'max_supporters_per_team', v_club_id, NEW.id::text);
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT max_supporters_per_team INTO v_limit
  FROM public.plan_limits WHERE plan = v_plan;

  SELECT COUNT(DISTINCT sl.supporter_id) INTO v_count
  FROM public.supporters_link sl
  JOIN public.team_members tm ON tm.user_id = sl.player_id
    AND tm.member_type = 'player'
    AND tm.is_active = true
    AND tm.deleted_at IS NULL
  WHERE tm.team_id = v_team_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_SUPPORTERS:Limite du plan % atteinte : % supporter(s) par équipe maximum. Passez en Pro pour en ajouter plus.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4.4 check_team_objective_limit
CREATE OR REPLACE FUNCTION public.check_team_objective_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  SELECT club_id INTO v_club_id FROM public.teams WHERE id = NEW.team_id;

  IF public.is_plan_bypass_active() THEN
    PERFORM public._log_plan_limit_bypass('team_objectives', 'max_team_objectives', v_club_id, NEW.id::text);
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT max_team_objectives INTO v_limit FROM public.plan_limits WHERE plan = v_plan;

  SELECT COUNT(*) INTO v_count
  FROM public.team_objectives
  WHERE team_id = NEW.team_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_OBJ:Limite du plan % atteinte : % objectif(s) d''équipe maximum.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4.5 check_player_objective_limit
CREATE OR REPLACE FUNCTION public.check_player_objective_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_plan public.subscription_plan;
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  SELECT club_id INTO v_club_id FROM public.teams WHERE id = NEW.team_id;

  IF public.is_plan_bypass_active() THEN
    PERFORM public._log_plan_limit_bypass('player_objectives', 'max_objectives_per_player', v_club_id, NEW.id::text);
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT max_objectives_per_player INTO v_limit FROM public.plan_limits WHERE plan = v_plan;

  SELECT COUNT(*) INTO v_count
  FROM public.player_objectives
  WHERE player_id = NEW.player_id
    AND team_id = NEW.team_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_OBJ:Limite du plan % atteinte : % objectif(s) par joueur maximum.', v_plan, v_limit;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4.6 check_evaluation_limit
CREATE OR REPLACE FUNCTION public.check_evaluation_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id UUID;
  v_plan public.subscription_plan;
  v_limits RECORD;
  v_count INTEGER;
  v_limit INTEGER;
  v_label TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.get_player_club_id(NEW.player_id) INTO v_club_id;

  IF v_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_plan_bypass_active() THEN
    PERFORM public._log_plan_limit_bypass('evaluations', 'max_'||NEW.type||'_evals_per_player', v_club_id, NEW.id::text);
    RETURN NEW;
  END IF;

  SELECT public.get_club_plan(v_club_id) INTO v_plan;
  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_plan;

  IF NEW.type = 'coach' THEN
    v_limit := v_limits.max_coach_evals_per_player;
    v_label := 'débrief(s) coach par joueur';
  ELSIF NEW.type = 'self' THEN
    v_limit := v_limits.max_self_evals_per_player;
    v_label := 'auto-débrief(s) par joueur';
  ELSIF NEW.type = 'supporter' THEN
    v_limit := v_limits.max_supporter_evals_per_player;
    v_label := 'débrief(s) supporter par joueur';
  ELSE
    RETURN NEW;
  END IF;

  IF v_limit IS NULL OR v_limit < 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.evaluations
  WHERE player_id = NEW.player_id
    AND type = NEW.type
    AND deleted_at IS NULL;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EVALS:Limite du plan % atteinte : % % maximum.', v_plan, v_limit, v_label;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;