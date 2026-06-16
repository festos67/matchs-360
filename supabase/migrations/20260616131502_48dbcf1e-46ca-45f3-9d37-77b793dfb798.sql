
CREATE OR REPLACE FUNCTION public.purge_old_frameworks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fw_ids UUID[];
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: purge requires service_role or admin'
      USING ERRCODE = '42501';
  END IF;

  -- Politique : pour chaque (team_id) OU (club_id, name) côté modèle club,
  -- conserver la version active + les 10 versions archivées les plus récentes.
  -- Au-delà : suppression si aucun débrief (actif ou archivé) ne référence
  -- le référentiel (garantit l'intégrité de l'historique).
  WITH ranked AS (
    SELECT
      cf.id,
      cf.is_archived,
      ROW_NUMBER() OVER (
        PARTITION BY
          COALESCE(cf.team_id::text, cf.club_id::text || '|' || cf.name),
          COALESCE(cf.is_archived, false)
        ORDER BY cf.created_at DESC
      ) AS rn
    FROM public.competence_frameworks cf
    WHERE cf.club_id IS NOT NULL OR cf.team_id IS NOT NULL
  )
  SELECT array_agg(r.id) INTO fw_ids
  FROM ranked r
  WHERE r.is_archived = true
    AND r.rn > 10
    AND NOT EXISTS (
      SELECT 1 FROM public.evaluations e WHERE e.framework_id = r.id
    );

  IF fw_ids IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.framework_purge_in_progress', 'on', true);

  DELETE FROM public.framework_snapshots
    WHERE framework_id = ANY(fw_ids);

  DELETE FROM public.skills
    WHERE theme_id IN (
      SELECT id FROM public.themes WHERE framework_id = ANY(fw_ids)
    );

  DELETE FROM public.themes
    WHERE framework_id = ANY(fw_ids);

  DELETE FROM public.competence_frameworks
    WHERE id = ANY(fw_ids);

  PERFORM set_config('app.framework_purge_in_progress', 'off', true);
END;
$function$;
