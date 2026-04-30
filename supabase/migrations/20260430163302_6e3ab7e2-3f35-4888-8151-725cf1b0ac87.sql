-- RPC atomique pour sauvegarder un référentiel complet en une seule transaction.
-- Évite les dizaines de round-trips PostgREST qui dépassent statement_timeout.
-- Le payload contient: { name, themes: [{id, name, color, order_index, is_new, skills: [{id, name, definition, order_index, is_new}]}] }

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
  v_kept_theme_ids uuid[] := ARRAY[]::uuid[];
  v_kept_skill_ids uuid[];
  v_authorized boolean;
BEGIN
  -- Vérification d'accès : l'appelant doit pouvoir éditer ce framework.
  -- On laisse RLS gérer ensuite, mais on bloque tôt si pas d'accès en lecture.
  SELECT EXISTS(
    SELECT 1 FROM public.competence_frameworks WHERE id = p_framework_id
  ) INTO v_authorized;
  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Framework introuvable ou accès refusé';
  END IF;

  -- 1) Update du nom
  UPDATE public.competence_frameworks
  SET name = p_name, updated_at = now()
  WHERE id = p_framework_id;

  -- 2) Boucle sur les thèmes
  FOR v_theme IN SELECT * FROM jsonb_array_elements(p_themes)
  LOOP
    IF (v_theme->>'is_new')::boolean THEN
      -- Insertion d'un nouveau thème
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

    -- Skills du thème
    v_kept_skill_ids := ARRAY[]::uuid[];
    FOR v_skill IN SELECT * FROM jsonb_array_elements(COALESCE(v_theme->'skills', '[]'::jsonb))
    LOOP
      IF (v_skill->>'is_new')::boolean THEN
        INSERT INTO public.skills (theme_id, name, definition, order_index)
        VALUES (
          v_theme_id,
          v_skill->>'name',
          v_skill->>'definition',
          (v_skill->>'order_index')::int
        );
      ELSE
        UPDATE public.skills
        SET name = v_skill->>'name',
            definition = v_skill->>'definition',
            order_index = (v_skill->>'order_index')::int
        WHERE id = (v_skill->>'id')::uuid AND theme_id = v_theme_id;
        v_kept_skill_ids := array_append(v_kept_skill_ids, (v_skill->>'id')::uuid);
      END IF;
    END LOOP;

    -- Suppression des skills retirés de ce thème (uniquement les non-new)
    IF array_length(v_kept_skill_ids, 1) IS NULL THEN
      DELETE FROM public.skills WHERE theme_id = v_theme_id;
    ELSE
      DELETE FROM public.skills
      WHERE theme_id = v_theme_id AND id <> ALL(v_kept_skill_ids);
    END IF;
  END LOOP;

  -- 3) Suppression des thèmes retirés du framework
  IF array_length(v_kept_theme_ids, 1) IS NULL THEN
    DELETE FROM public.themes WHERE framework_id = p_framework_id;
  ELSE
    DELETE FROM public.themes
    WHERE framework_id = p_framework_id AND id <> ALL(v_kept_theme_ids);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_framework_atomic(uuid, text, jsonb) TO authenticated;