-- F-101 P0-5 : Bloquer les hard-deletes en cascade depuis clubs/teams.
-- Force le soft-delete (deleted_at) pour préserver l'historique forensic.
-- service_role conserve la possibilité de hard-delete (jobs RGPD/purge).

CREATE OR REPLACE FUNCTION public.prevent_hard_delete_force_soft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- service_role bypass : jobs RGPD, purge, migrations, edge functions backend.
  IF auth.role() = 'service_role' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Hard delete on % is forbidden. Use UPDATE deleted_at = now() instead (soft delete).', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

-- Tables avec colonne deleted_at -> bloquer DELETE physique.
DROP TRIGGER IF EXISTS prevent_hard_delete_clubs ON public.clubs;
CREATE TRIGGER prevent_hard_delete_clubs
  BEFORE DELETE ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_force_soft();

DROP TRIGGER IF EXISTS prevent_hard_delete_teams ON public.teams;
CREATE TRIGGER prevent_hard_delete_teams
  BEFORE DELETE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_force_soft();

DROP TRIGGER IF EXISTS prevent_hard_delete_team_members ON public.team_members;
CREATE TRIGGER prevent_hard_delete_team_members
  BEFORE DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_force_soft();

-- evaluation_scores : pas de deleted_at propre, mais perte de données forensic
-- si supprimées hors du flow soft-delete d'evaluations. On bloque en non
-- service_role ; le hard-delete reste possible via jobs purge_old_evaluations.
DROP TRIGGER IF EXISTS prevent_hard_delete_evaluation_scores ON public.evaluation_scores;
CREATE TRIGGER prevent_hard_delete_evaluation_scores
  BEFORE DELETE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_force_soft();

DROP TRIGGER IF EXISTS prevent_hard_delete_evaluation_objectives ON public.evaluation_objectives;
CREATE TRIGGER prevent_hard_delete_evaluation_objectives
  BEFORE DELETE ON public.evaluation_objectives
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_force_soft();

-- Frameworks/themes/skills : protégés sauf via job purge (service_role).
-- Note : la fonction import_framework_atomic recompose themes/skills via
-- DELETE ; elle tourne en SECURITY DEFINER sans changer auth.role(), donc
-- elle serait bloquée. On l'exempte via une garde dédiée.

CREATE OR REPLACE FUNCTION public.prevent_hard_delete_framework_tree()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- service_role bypass.
  IF auth.role() = 'service_role' THEN
    RETURN OLD;
  END IF;
  -- Bypass contrôlé pour le flow d'import atomique de référentiel.
  -- import_framework_atomic positionne ce GUC le temps de sa transaction.
  IF current_setting('app.framework_import_in_progress', true) = 'on' THEN
    RETURN OLD;
  END IF;
  -- Bypass contrôlé pour les jobs de purge (purge_old_frameworks).
  IF current_setting('app.framework_purge_in_progress', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Hard delete on % is forbidden outside of service_role / purge / framework import.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS prevent_hard_delete_competence_frameworks ON public.competence_frameworks;
CREATE TRIGGER prevent_hard_delete_competence_frameworks
  BEFORE DELETE ON public.competence_frameworks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_framework_tree();

DROP TRIGGER IF EXISTS prevent_hard_delete_themes ON public.themes;
CREATE TRIGGER prevent_hard_delete_themes
  BEFORE DELETE ON public.themes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_framework_tree();

DROP TRIGGER IF EXISTS prevent_hard_delete_skills ON public.skills;
CREATE TRIGGER prevent_hard_delete_skills
  BEFORE DELETE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.prevent_hard_delete_framework_tree();

-- Patcher import_framework_atomic pour positionner le GUC bypass.
CREATE OR REPLACE FUNCTION public.import_framework_atomic(
  p_source_framework_id uuid,
  p_target_team_id uuid,
  p_target_club_id uuid,
  p_framework_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  -- ---- Authorization ----
  IF auth.role() <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF p_target_team_id IS NOT NULL THEN
      SELECT club_id INTO v_target_club_id FROM public.teams WHERE id = p_target_team_id;
    ELSE
      v_target_club_id := p_target_club_id;
    END IF;
    IF NOT (
      public.is_admin(v_caller)
      OR (v_target_club_id IS NOT NULL AND public.is_club_admin(v_caller, v_target_club_id))
      OR (p_target_team_id IS NOT NULL AND public.is_referent_coach_of_team(v_caller, p_target_team_id))
    ) THEN
      RAISE EXCEPTION 'forbidden: caller lacks permission to import framework into target'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_source_framework_id IS NULL THEN RAISE EXCEPTION 'source_framework_id is required'; END IF;
  IF p_framework_name IS NULL OR length(trim(p_framework_name)) = 0 THEN
    RAISE EXCEPTION 'framework_name is required';
  END IF;
  IF (p_target_team_id IS NULL AND p_target_club_id IS NULL)
     OR (p_target_team_id IS NOT NULL AND p_target_club_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of target_team_id or target_club_id must be provided';
  END IF;

  v_is_club_import := p_target_club_id IS NOT NULL;

  IF NOT EXISTS (SELECT 1 FROM public.competence_frameworks WHERE id = p_source_framework_id) THEN
    RAISE EXCEPTION 'Source framework not found';
  END IF;

  v_lock_key := hashtextextended(
    CASE WHEN v_is_club_import THEN 'club:' ELSE 'team:' END
      || COALESCE(p_target_club_id::text, p_target_team_id::text), 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF v_is_club_import THEN
    SELECT id INTO v_existing_id FROM public.competence_frameworks
    WHERE club_id = p_target_club_id AND is_template = true AND is_archived = false LIMIT 1;
  ELSE
    SELECT id INTO v_existing_id FROM public.competence_frameworks
    WHERE team_id = p_target_team_id AND is_archived = false LIMIT 1;
  END IF;

  -- Active le bypass des triggers prevent_hard_delete_framework_tree
  -- pour la durée de la transaction.
  PERFORM set_config('app.framework_import_in_progress', 'on', true);

  IF v_existing_id IS NOT NULL THEN
    v_new_framework_id := v_existing_id;
    DELETE FROM public.skills
    WHERE theme_id IN (SELECT id FROM public.themes WHERE framework_id = v_existing_id);
    DELETE FROM public.themes WHERE framework_id = v_existing_id;
    UPDATE public.competence_frameworks
    SET name = p_framework_name, is_archived = false, archived_at = NULL, updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.competence_frameworks (name, is_template, club_id, team_id)
    VALUES (
      p_framework_name, v_is_club_import,
      CASE WHEN v_is_club_import THEN p_target_club_id ELSE NULL END,
      CASE WHEN v_is_club_import THEN NULL ELSE p_target_team_id END
    ) RETURNING id INTO v_new_framework_id;
  END IF;

  FOR v_theme IN
    SELECT id, name, color, order_index FROM public.themes
    WHERE framework_id = p_source_framework_id ORDER BY order_index
  LOOP
    INSERT INTO public.themes (framework_id, name, color, order_index)
    VALUES (v_new_framework_id, v_theme.name, v_theme.color, v_theme.order_index)
    RETURNING id INTO v_new_theme_id;

    INSERT INTO public.skills (theme_id, name, definition, order_index)
    SELECT v_new_theme_id, s.name, s.definition, s.order_index
    FROM public.skills s WHERE s.theme_id = v_theme.id;
  END LOOP;

  PERFORM set_config('app.framework_import_in_progress', 'off', true);
  RETURN v_new_framework_id;
END;
$$;

-- Patcher purge_old_frameworks pour positionner le GUC bypass.
CREATE OR REPLACE FUNCTION public.purge_old_frameworks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE fw_ids UUID[];
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: purge requires service_role or admin'
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO fw_ids
  FROM public.competence_frameworks cf
  WHERE cf.id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at DESC) AS rn
      FROM public.competence_frameworks WHERE is_archived = false
    ) recent WHERE rn <= 3
  )
  AND EXISTS (SELECT 1 FROM public.framework_snapshots fs WHERE fs.framework_id = cf.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.evaluations e WHERE e.framework_id = cf.id AND e.deleted_at IS NULL
  );

  IF fw_ids IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.framework_purge_in_progress', 'on', true);
  DELETE FROM public.skills WHERE theme_id IN (
    SELECT id FROM public.themes WHERE framework_id = ANY(fw_ids));
  DELETE FROM public.themes WHERE framework_id = ANY(fw_ids);
  DELETE FROM public.competence_frameworks WHERE id = ANY(fw_ids);
  PERFORM set_config('app.framework_purge_in_progress', 'off', true);
END;
$$;