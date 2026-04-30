CREATE OR REPLACE FUNCTION public.prevent_hard_delete_framework_tree()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN OLD;
  END IF;

  IF current_setting('app.framework_save_in_progress', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF current_setting('app.framework_import_in_progress', true) = 'on' THEN
    RETURN OLD;
  END IF;

  IF current_setting('app.framework_purge_in_progress', true) = 'on' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Hard delete on % is forbidden outside of service_role / purge / framework import / framework save.', TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.save_framework_atomic(
  p_framework_id uuid,
  p_name text,
  p_themes jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_theme jsonb;
  v_skill jsonb;
  v_theme_id uuid;
  v_skill_id uuid;
  v_kept_theme_ids uuid[] := ARRAY[]::uuid[];
  v_kept_skill_ids uuid[];
  v_authorized boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.competence_frameworks WHERE id = p_framework_id
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Framework introuvable ou accès refusé' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.framework_save_in_progress', 'on', true);

  UPDATE public.competence_frameworks
  SET name = p_name, updated_at = now()
  WHERE id = p_framework_id;

  FOR v_theme IN SELECT * FROM jsonb_array_elements(COALESCE(p_themes, '[]'::jsonb))
  LOOP
    IF COALESCE((v_theme->>'is_new')::boolean, false) THEN
      INSERT INTO public.themes (framework_id, name, color, order_index)
      VALUES (
        p_framework_id,
        v_theme->>'name',
        v_theme->>'color',
        (v_theme->>'order_index')::int
      )
      RETURNING id INTO v_theme_id;
    ELSE
      v_theme_id := (v_theme->>'id')::uuid;
      UPDATE public.themes
      SET name = v_theme->>'name',
          color = v_theme->>'color',
          order_index = (v_theme->>'order_index')::int
      WHERE id = v_theme_id AND framework_id = p_framework_id;
    END IF;

    v_kept_theme_ids := array_append(v_kept_theme_ids, v_theme_id);
    v_kept_skill_ids := ARRAY[]::uuid[];

    FOR v_skill IN SELECT * FROM jsonb_array_elements(COALESCE(v_theme->'skills', '[]'::jsonb))
    LOOP
      IF COALESCE((v_skill->>'is_new')::boolean, false) THEN
        INSERT INTO public.skills (theme_id, name, definition, order_index)
        VALUES (
          v_theme_id,
          v_skill->>'name',
          v_skill->>'definition',
          (v_skill->>'order_index')::int
        )
        RETURNING id INTO v_skill_id;
      ELSE
        v_skill_id := (v_skill->>'id')::uuid;
        UPDATE public.skills
        SET name = v_skill->>'name',
            definition = v_skill->>'definition',
            order_index = (v_skill->>'order_index')::int
        WHERE id = v_skill_id AND theme_id = v_theme_id;
      END IF;

      v_kept_skill_ids := array_append(v_kept_skill_ids, v_skill_id);
    END LOOP;

    IF array_length(v_kept_skill_ids, 1) IS NULL THEN
      DELETE FROM public.skills WHERE theme_id = v_theme_id;
    ELSE
      DELETE FROM public.skills
      WHERE theme_id = v_theme_id AND id <> ALL(v_kept_skill_ids);
    END IF;
  END LOOP;

  IF array_length(v_kept_theme_ids, 1) IS NULL THEN
    DELETE FROM public.themes WHERE framework_id = p_framework_id;
  ELSE
    DELETE FROM public.themes
    WHERE framework_id = p_framework_id AND id <> ALL(v_kept_theme_ids);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_framework_atomic(uuid, text, jsonb) TO authenticated;