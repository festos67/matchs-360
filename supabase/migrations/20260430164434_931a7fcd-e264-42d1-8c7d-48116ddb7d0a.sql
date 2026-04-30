CREATE OR REPLACE FUNCTION public.save_framework_atomic(
  p_framework_id uuid,
  p_name text,
  p_themes jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_framework public.competence_frameworks%ROWTYPE;
  v_theme jsonb;
  v_skill jsonb;
  v_new_framework_id uuid;
  v_new_theme_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentification requise' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_framework
  FROM public.competence_frameworks
  WHERE id = p_framework_id
    AND COALESCE(is_archived, false) = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Framework introuvable ou déjà archivé' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_admin(v_caller)
    OR (v_framework.club_id IS NOT NULL AND public.is_club_admin(v_caller, v_framework.club_id))
    OR (v_framework.team_id IS NOT NULL AND public.is_club_admin_of_team(v_caller, v_framework.team_id))
    OR (v_framework.team_id IS NOT NULL AND public.is_referent_coach_of_team(v_caller, v_framework.team_id))
  ) THEN
    RAISE EXCEPTION 'Accès refusé pour modifier ce référentiel' USING ERRCODE = '42501';
  END IF;

  UPDATE public.competence_frameworks
  SET is_archived = true,
      archived_at = now(),
      updated_at = now()
  WHERE id = p_framework_id;

  INSERT INTO public.competence_frameworks (
    name,
    club_id,
    team_id,
    is_template,
    is_archived,
    archived_at
  ) VALUES (
    p_name,
    v_framework.club_id,
    v_framework.team_id,
    v_framework.is_template,
    false,
    null
  )
  RETURNING id INTO v_new_framework_id;

  FOR v_theme IN SELECT * FROM jsonb_array_elements(COALESCE(p_themes, '[]'::jsonb))
  LOOP
    INSERT INTO public.themes (framework_id, name, color, order_index)
    VALUES (
      v_new_framework_id,
      COALESCE(NULLIF(v_theme->>'name', ''), 'Thématique'),
      v_theme->>'color',
      COALESCE((v_theme->>'order_index')::int, 0)
    )
    RETURNING id INTO v_new_theme_id;

    FOR v_skill IN SELECT * FROM jsonb_array_elements(COALESCE(v_theme->'skills', '[]'::jsonb))
    LOOP
      INSERT INTO public.skills (theme_id, name, definition, order_index)
      VALUES (
        v_new_theme_id,
        COALESCE(NULLIF(v_skill->>'name', ''), 'Compétence'),
        NULLIF(v_skill->>'definition', ''),
        COALESCE((v_skill->>'order_index')::int, 0)
      );
    END LOOP;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_framework_atomic(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_framework_atomic(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_framework_atomic(uuid, text, jsonb) TO authenticated;