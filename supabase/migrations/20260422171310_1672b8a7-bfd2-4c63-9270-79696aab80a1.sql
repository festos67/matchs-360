-- =====================================================
-- import_framework_atomic
-- Encapsulates the framework copy (themes + skills) in a
-- single PostgreSQL transaction with an advisory lock keyed
-- on the target (team or club + template flag) to prevent
-- concurrent imports from corrupting data.
--
-- SECURITY: SECURITY DEFINER — caller authorization MUST be
-- enforced by the calling edge function BEFORE invoking this
-- RPC. The function only validates structural inputs.
-- =====================================================
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
  v_is_club_import boolean;
  v_lock_key bigint;
  v_existing_id uuid;
  v_new_framework_id uuid;
  v_theme record;
  v_new_theme_id uuid;
BEGIN
  -- ---- Input validation ----
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

  -- ---- Verify source exists ----
  IF NOT EXISTS (
    SELECT 1 FROM public.competence_frameworks WHERE id = p_source_framework_id
  ) THEN
    RAISE EXCEPTION 'Source framework not found';
  END IF;

  -- ---- Acquire transaction-scoped advisory lock on target ----
  -- Lock is automatically released at COMMIT/ROLLBACK.
  -- Key derived from target type + id to serialize concurrent
  -- imports on the SAME target only.
  v_lock_key := hashtextextended(
    CASE WHEN v_is_club_import THEN 'club:' ELSE 'team:' END
      || COALESCE(p_target_club_id::text, p_target_team_id::text),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- ---- Find existing non-archived framework on target ----
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

  -- ---- Reset or create target framework ----
  IF v_existing_id IS NOT NULL THEN
    v_new_framework_id := v_existing_id;

    -- Delete existing skills (no FK cascade in schema, must be explicit)
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

  -- ---- Copy themes + skills from source ----
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
$$;

-- Restrict execution to authenticated callers (edge functions use service_role which bypasses).
REVOKE ALL ON FUNCTION public.import_framework_atomic(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_framework_atomic(uuid, uuid, uuid, text) TO authenticated, service_role;