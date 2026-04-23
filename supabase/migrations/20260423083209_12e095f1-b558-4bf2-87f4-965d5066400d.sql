-- ============================================================
-- HARDENING: SECURITY DEFINER RPCs exposed to authenticated/anon
-- Strategy: belt + suspenders (REVOKE + internal authz check)
-- ============================================================

-- ------------------------------------------------------------
-- 1) import_framework_atomic
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.import_framework_atomic(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_framework_atomic(
  p_source_framework_id uuid,
  p_target_team_id uuid,
  p_target_club_id uuid,
  p_framework_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_club_import boolean;
  v_lock_key bigint;
  v_existing_id uuid;
  v_new_framework_id uuid;
  v_theme record;
  v_new_theme_id uuid;
  v_target_club_id uuid;
BEGIN
  -- ---- Defense in depth: authorization check ----
  -- Allow service_role unconditionally (legitimate edge function path).
  IF auth.role() <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    -- Resolve target club id (from team or direct)
    IF p_target_team_id IS NOT NULL THEN
      SELECT club_id INTO v_target_club_id
      FROM public.teams WHERE id = p_target_team_id;
    ELSE
      v_target_club_id := p_target_club_id;
    END IF;

    IF NOT (
      public.is_admin(v_caller)
      OR (v_target_club_id IS NOT NULL
          AND public.is_club_admin(v_caller, v_target_club_id))
      OR (p_target_team_id IS NOT NULL
          AND public.is_referent_coach_of_team(v_caller, p_target_team_id))
    ) THEN
      RAISE EXCEPTION 'forbidden: caller lacks permission to import framework into target'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ---- Input validation (original) ----
  IF p_source_framework_id IS NULL THEN
    RAISE EXCEPTION 'source_framework_id is required';
  END IF;
  IF p_framework_name IS NULL OR length(trim(p_framework_name)) = 0 THEN
    RAISE EXCEPTION 'framework_name is required';
  END IF;
  IF (p_target_team_id IS NULL AND p_target_club_id IS NULL)
     OR (p_target_team_id IS NOT NULL AND p_target_club_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of target_team_id or target_club_id must be provided';
  END IF;

  v_is_club_import := p_target_club_id IS NOT NULL;

  IF NOT EXISTS (
    SELECT 1 FROM public.competence_frameworks WHERE id = p_source_framework_id
  ) THEN
    RAISE EXCEPTION 'Source framework not found';
  END IF;

  v_lock_key := hashtextextended(
    CASE WHEN v_is_club_import THEN 'club:' ELSE 'team:' END
      || COALESCE(p_target_club_id::text, p_target_team_id::text),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_is_club_import THEN
    SELECT id INTO v_existing_id
    FROM public.competence_frameworks
    WHERE club_id = p_target_club_id
      AND is_template = true
      AND is_archived = false
    LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id
    FROM public.competence_frameworks
    WHERE team_id = p_target_team_id
      AND is_archived = false
    LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    v_new_framework_id := v_existing_id;
    DELETE FROM public.skills
    WHERE theme_id IN (
      SELECT id FROM public.themes WHERE framework_id = v_existing_id
    );
    DELETE FROM public.themes WHERE framework_id = v_existing_id;
    UPDATE public.competence_frameworks
    SET name = p_framework_name,
        is_archived = false,
        archived_at = NULL,
        updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.competence_frameworks (
      name, is_template, club_id, team_id
    ) VALUES (
      p_framework_name,
      v_is_club_import,
      CASE WHEN v_is_club_import THEN p_target_club_id ELSE NULL END,
      CASE WHEN v_is_club_import THEN NULL ELSE p_target_team_id END
    )
    RETURNING id INTO v_new_framework_id;
  END IF;

  FOR v_theme IN
    SELECT id, name, color, order_index
    FROM public.themes
    WHERE framework_id = p_source_framework_id
    ORDER BY order_index
  LOOP
    INSERT INTO public.themes (framework_id, name, color, order_index)
    VALUES (v_new_framework_id, v_theme.name, v_theme.color, v_theme.order_index)
    RETURNING id INTO v_new_theme_id;

    INSERT INTO public.skills (theme_id, name, definition, order_index)
    SELECT v_new_theme_id, s.name, s.definition, s.order_index
    FROM public.skills s
    WHERE s.theme_id = v_theme.id;
  END LOOP;

  RETURN v_new_framework_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.import_framework_atomic(uuid, uuid, uuid, text)
  TO service_role;

-- ------------------------------------------------------------
-- 2) purge_old_audit_log
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.purge_old_audit_log()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_old_audit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: purge requires service_role or admin'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.audit_log
  WHERE created_at < now() - INTERVAL '1 year';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_old_audit_log() TO service_role;

-- ------------------------------------------------------------
-- 3) purge_old_evaluations
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.purge_old_evaluations()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_old_evaluations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: purge requires service_role or admin'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.evaluations
  SET deleted_at = now()
  WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY player_id, type
          ORDER BY created_at DESC
        ) AS rn,
        type
      FROM public.evaluations
      WHERE deleted_at IS NULL
    ) ranked
    WHERE (type = 'coach'     AND rn <= 30)
       OR (type = 'self'      AND rn <= 10)
       OR (type = 'supporter' AND rn <= 10)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_old_evaluations() TO service_role;

-- ------------------------------------------------------------
-- 4) purge_old_frameworks
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.purge_old_frameworks()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_old_frameworks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  fw_ids UUID[];
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: purge requires service_role or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO fw_ids
  FROM public.competence_frameworks cf
  WHERE cf.id NOT IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY team_id
          ORDER BY created_at DESC
        ) AS rn
      FROM public.competence_frameworks
      WHERE is_archived = false
    ) recent
    WHERE rn <= 3
  )
  AND EXISTS (
    SELECT 1 FROM public.framework_snapshots fs
    WHERE fs.framework_id = cf.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.framework_id = cf.id AND e.deleted_at IS NULL
  );

  IF fw_ids IS NULL THEN RETURN; END IF;

  DELETE FROM public.skills
  WHERE theme_id IN (
    SELECT id FROM public.themes WHERE framework_id = ANY(fw_ids)
  );
  DELETE FROM public.themes
  WHERE framework_id = ANY(fw_ids);
  DELETE FROM public.competence_frameworks
  WHERE id = ANY(fw_ids);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_old_frameworks() TO service_role;

-- ------------------------------------------------------------
-- 5) create_trial_notifications  (cron-only)
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_trial_notifications()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_trial_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sub RECORD;
  v_user RECORD;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: cron-only function'
      USING ERRCODE = '42501';
  END IF;

  -- J-7 : club_admin + coaches
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE + INTERVAL '7 days'
  LOOP
    FOR v_user IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.club_id = v_sub.club_id
        AND ur.role IN ('club_admin', 'coach')
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      SELECT v_user.user_id,
        'Essai Pro : 7 jours restants',
        'Votre essai Pro pour ' || v_sub.club_name || ' se termine dans 7 jours. Passez en Pro pour ne rien perdre.',
        'subscription', '/pricing'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_user.user_id
          AND n.title = 'Essai Pro : 7 jours restants'
          AND n.created_at::date = CURRENT_DATE
      );
    END LOOP;
  END LOOP;

  -- J-1 : club_admin only
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE + INTERVAL '1 day'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT ur.user_id,
      'Dernier jour d''essai Pro !',
      'Demain, ' || v_sub.club_name || ' passera au plan gratuit. Passez en Pro maintenant.',
      'subscription', '/pricing'
    FROM public.user_roles ur
    WHERE ur.club_id = v_sub.club_id
      AND ur.role = 'club_admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.title = 'Dernier jour d''essai Pro !'
          AND n.created_at::date = CURRENT_DATE
      );
  END LOOP;

  -- J0 : fin d'essai
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.is_trial = true AND s.plan = 'pro'
      AND s.ends_at = CURRENT_DATE
  LOOP
    FOR v_user IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.club_id = v_sub.club_id
        AND ur.role IN ('club_admin', 'coach')
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, link)
      SELECT v_user.user_id,
        'Essai Pro terminé',
        'Votre essai Pro pour ' || v_sub.club_name || ' est terminé. Vous êtes maintenant sur le plan gratuit. Certaines fonctionnalités sont désormais limitées.',
        'subscription', '/pricing'
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_user.user_id
          AND n.title = 'Essai Pro terminé'
          AND n.created_at::date = CURRENT_DATE
      );
    END LOOP;
  END LOOP;

  -- J-30 : rappel renouvellement Pro payant
  FOR v_sub IN
    SELECT s.*, c.name AS club_name
    FROM public.subscriptions s
    JOIN public.clubs c ON c.id = s.club_id
    WHERE s.plan = 'pro' AND s.is_trial = false AND s.auto_renew = true
      AND s.ends_at = CURRENT_DATE + INTERVAL '30 days'
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT ur.user_id,
      'Renouvellement Pro dans 30 jours',
      'Votre abonnement Pro pour ' || v_sub.club_name || ' se renouvelle automatiquement le ' || to_char(v_sub.ends_at + 1, 'DD/MM/YYYY') || '. Désactivez le renouvellement avant cette date si vous ne souhaitez pas renouveler.',
      'subscription', '/pricing'
    FROM public.user_roles ur
    WHERE ur.club_id = v_sub.club_id
      AND ur.role = 'club_admin'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ur.user_id
          AND n.title = 'Renouvellement Pro dans 30 jours'
          AND n.created_at::date = CURRENT_DATE
      );
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_trial_notifications() TO service_role;

-- ------------------------------------------------------------
-- Expected post-migration ACLs (proacl):
--   import_framework_atomic     : postgres + service_role only
--   purge_old_audit_log         : postgres + service_role only
--   purge_old_evaluations       : postgres + service_role only
--   purge_old_frameworks        : postgres + service_role only
--   create_trial_notifications  : postgres + service_role only
-- ------------------------------------------------------------
