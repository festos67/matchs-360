
-- Add talent feature: optional free-text observation captured during a coach debrief.
-- It is NOT a score; it does not affect averages. Surfaces only when the framework
-- enables the feature, and is only shown in results when the coach filled it.

ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS talent text;

ALTER TABLE public.competence_frameworks
  ADD COLUMN IF NOT EXISTS talent_enabled boolean NOT NULL DEFAULT true;

-- Disable on Santé Publique France template only
UPDATE public.competence_frameworks
SET talent_enabled = false
WHERE id = '00000000-0000-0000-0000-000000000003';

-- Update atomic import so derived frameworks inherit the talent_enabled flag.
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
  v_source_talent_enabled boolean;
BEGIN
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

  SELECT talent_enabled INTO v_source_talent_enabled
  FROM public.competence_frameworks WHERE id = p_source_framework_id;
  IF v_source_talent_enabled IS NULL THEN
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

  IF v_existing_id IS NOT NULL THEN
    v_new_framework_id := v_existing_id;
    DELETE FROM public.skills WHERE theme_id IN (
      SELECT id FROM public.themes WHERE framework_id = v_existing_id);
    DELETE FROM public.themes WHERE framework_id = v_existing_id;
    UPDATE public.competence_frameworks
    SET name = p_framework_name, is_archived = false, archived_at = NULL,
        talent_enabled = v_source_talent_enabled, updated_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.competence_frameworks (name, is_template, club_id, team_id, talent_enabled)
    VALUES (
      p_framework_name, v_is_club_import,
      CASE WHEN v_is_club_import THEN p_target_club_id ELSE NULL END,
      CASE WHEN v_is_club_import THEN NULL ELSE p_target_team_id END,
      v_source_talent_enabled
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

  RETURN v_new_framework_id;
END;
$function$;
