
CREATE OR REPLACE FUNCTION public.purge_old_frameworks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fw_ids UUID[];
BEGIN
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
  -- Must have a snapshot
  AND EXISTS (
    SELECT 1 FROM public.framework_snapshots fs
    WHERE fs.framework_id = cf.id
  )
  -- No active evaluations referencing this framework
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
$$;
