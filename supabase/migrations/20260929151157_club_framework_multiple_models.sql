-- =====================================================================
-- Plusieurs modèles de référentiel par club (au moins adultes / jeunes).
--
-- Jusqu'ici un club n'avait qu'UN référentiel modèle actif (club_id,
-- is_template, non archivé) : chaque import l'écrasait et le front le lisait
-- avec maybeSingle(). Désormais :
--  - model_key : identifiant stable d'un modèle, commun à toutes ses
--    versions (save_framework_atomic archive la version courante et en crée
--    une nouvelle : la lignée suit model_key, l'historique aussi) ;
--  - audience : public visé ('adult' | 'youth' | NULL = tous publics),
--    utilisé pour proposer le bon modèle à la création d'une équipe ;
--  - import_framework_atomic : pour un club, remplace le modèle désigné par
--    p_target_model_key, ou crée un NOUVEAU modèle si aucun n'est désigné.
-- Au passage, save_framework_atomic conserve talent_enabled (la nouvelle
-- version repartait sur la valeur par défaut).
-- =====================================================================

ALTER TABLE public.competence_frameworks
  ADD COLUMN IF NOT EXISTS model_key uuid,
  ADD COLUMN IF NOT EXISTS audience text;

ALTER TABLE public.competence_frameworks
  DROP CONSTRAINT IF EXISTS competence_frameworks_audience_check;
ALTER TABLE public.competence_frameworks
  ADD CONSTRAINT competence_frameworks_audience_check
  CHECK (audience IS NULL OR audience IN ('adult', 'youth'));

-- Lignées existantes : un seul modèle par club jusqu'ici, un référentiel par
-- équipe. Toutes les versions d'un même club (resp. équipe) partagent donc
-- la même clé.
WITH club_keys AS (
  SELECT club_id, gen_random_uuid() AS k
  FROM (SELECT DISTINCT club_id FROM public.competence_frameworks
        WHERE club_id IS NOT NULL AND team_id IS NULL) c
)
UPDATE public.competence_frameworks f
   SET model_key = ck.k
  FROM club_keys ck
 WHERE f.club_id = ck.club_id AND f.team_id IS NULL AND f.model_key IS NULL;

WITH team_keys AS (
  SELECT team_id, gen_random_uuid() AS k
  FROM (SELECT DISTINCT team_id FROM public.competence_frameworks
        WHERE team_id IS NOT NULL) t
)
UPDATE public.competence_frameworks f
   SET model_key = tk.k
  FROM team_keys tk
 WHERE f.team_id = tk.team_id AND f.model_key IS NULL;

UPDATE public.competence_frameworks SET model_key = gen_random_uuid() WHERE model_key IS NULL;

ALTER TABLE public.competence_frameworks
  ALTER COLUMN model_key SET DEFAULT gen_random_uuid(),
  ALTER COLUMN model_key SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competence_frameworks_model_key
  ON public.competence_frameworks (model_key, is_archived);

-- Une seule version active par modèle de club.
CREATE UNIQUE INDEX IF NOT EXISTS uq_competence_frameworks_active_club_model
  ON public.competence_frameworks (model_key)
  WHERE club_id IS NOT NULL AND team_id IS NULL AND is_archived = false;

-- Sauvegarde : la nouvelle version garde la lignée, le public et le réglage
-- « talent ».
CREATE OR REPLACE FUNCTION public.save_framework_atomic(p_framework_id uuid, p_name text, p_themes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_framework public.competence_frameworks%ROWTYPE;
  v_theme jsonb;
  v_skill jsonb;
  v_new_framework_id uuid;
  v_new_theme_id uuid;
  v_result jsonb;
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
    name, club_id, team_id, is_template, is_archived, archived_at,
    model_key, audience, talent_enabled
  ) VALUES (
    p_name, v_framework.club_id, v_framework.team_id, v_framework.is_template, false, null,
    v_framework.model_key, v_framework.audience, v_framework.talent_enabled
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

  -- Renvoie le nouveau référentiel complet (forme attendue par le front),
  -- thèmes et compétences triés par order_index, avec leurs nouveaux ids.
  SELECT to_jsonb(f.*) || jsonb_build_object(
    'themes', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(t.*) || jsonb_build_object(
          'skills', COALESCE((
            SELECT jsonb_agg(to_jsonb(s.*) ORDER BY s.order_index)
            FROM public.skills s WHERE s.theme_id = t.id
          ), '[]'::jsonb)
        )
        ORDER BY t.order_index
      )
      FROM public.themes t WHERE t.framework_id = v_new_framework_id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.competence_frameworks f
  WHERE f.id = v_new_framework_id;

  RETURN v_result;
END;
$function$;

-- Import : modèle de club désigné (remplacé) ou nouveau modèle.
DROP FUNCTION IF EXISTS public.import_framework_atomic(uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.import_framework_atomic(
  p_source_framework_id uuid,
  p_target_team_id uuid,
  p_target_club_id uuid,
  p_framework_name text,
  p_target_model_key uuid DEFAULT NULL,
  p_audience text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF p_audience IS NOT NULL AND p_audience NOT IN ('adult', 'youth') THEN
    RAISE EXCEPTION 'invalid audience';
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
    -- Modèle désigné : on le remplace ; sinon, nouveau modèle.
    IF p_target_model_key IS NOT NULL THEN
      SELECT id INTO v_existing_id FROM public.competence_frameworks
      WHERE club_id = p_target_club_id AND team_id IS NULL AND is_template = true
        AND is_archived = false AND model_key = p_target_model_key
      LIMIT 1;
    END IF;
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
        talent_enabled = v_source_talent_enabled, updated_at = now(),
        audience = CASE WHEN v_is_club_import THEN p_audience ELSE audience END
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.competence_frameworks (name, is_template, club_id, team_id, talent_enabled, model_key, audience)
    VALUES (
      p_framework_name, v_is_club_import,
      CASE WHEN v_is_club_import THEN p_target_club_id ELSE NULL END,
      CASE WHEN v_is_club_import THEN NULL ELSE p_target_team_id END,
      v_source_talent_enabled,
      -- Réinitialisation d'un modèle archivé : on garde sa lignée.
      COALESCE(CASE WHEN v_is_club_import THEN p_target_model_key END, gen_random_uuid()),
      CASE WHEN v_is_club_import THEN p_audience END
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

REVOKE ALL ON FUNCTION public.import_framework_atomic(uuid, uuid, uuid, text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_framework_atomic(uuid, uuid, uuid, text, uuid, text) TO service_role;
