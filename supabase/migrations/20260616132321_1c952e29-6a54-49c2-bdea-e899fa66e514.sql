CREATE OR REPLACE FUNCTION public.purge_old_frameworks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_ids uuid[];
BEGIN
  PERFORM set_config('app.framework_purge_in_progress', 'on', true);

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY club_id
             ORDER BY COALESCE(archived_at, created_at) DESC
           ) AS rn
    FROM public.competence_frameworks
    WHERE club_id IS NOT NULL
      AND team_id IS NULL
      AND is_archived = true
  ),
  to_delete AS (
    SELECT r.id FROM ranked r
    WHERE r.rn > 10
      AND NOT EXISTS (SELECT 1 FROM public.evaluations e WHERE e.framework_id = r.id)
  )
  SELECT array_agg(id) INTO v_deleted_ids FROM to_delete;

  IF v_deleted_ids IS NOT NULL THEN
    DELETE FROM public.framework_snapshots WHERE framework_id = ANY(v_deleted_ids);
    DELETE FROM public.skills WHERE theme_id IN (SELECT id FROM public.themes WHERE framework_id = ANY(v_deleted_ids));
    DELETE FROM public.themes WHERE framework_id = ANY(v_deleted_ids);
    DELETE FROM public.competence_frameworks WHERE id = ANY(v_deleted_ids);
  END IF;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY team_id
             ORDER BY COALESCE(archived_at, created_at) DESC
           ) AS rn
    FROM public.competence_frameworks
    WHERE team_id IS NOT NULL
      AND is_archived = true
  ),
  to_delete AS (
    SELECT r.id FROM ranked r
    WHERE r.rn > 10
      AND NOT EXISTS (SELECT 1 FROM public.evaluations e WHERE e.framework_id = r.id)
  )
  SELECT array_agg(id) INTO v_deleted_ids FROM to_delete;

  IF v_deleted_ids IS NOT NULL THEN
    DELETE FROM public.framework_snapshots WHERE framework_id = ANY(v_deleted_ids);
    DELETE FROM public.skills WHERE theme_id IN (SELECT id FROM public.themes WHERE framework_id = ANY(v_deleted_ids));
    DELETE FROM public.themes WHERE framework_id = ANY(v_deleted_ids);
    DELETE FROM public.competence_frameworks WHERE id = ANY(v_deleted_ids);
  END IF;

  PERFORM set_config('app.framework_purge_in_progress', 'off', true);
END;
$$;

SELECT public.purge_old_frameworks();
