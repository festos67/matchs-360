
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create purge function
CREATE OR REPLACE FUNCTION public.purge_old_evaluations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.evaluations
  SET deleted_at = now()
  WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY player_id, type
          ORDER BY created_at DESC
        ) AS rn,
        type
      FROM public.evaluations
      WHERE deleted_at IS NULL
    ) ranked
    WHERE (type = 'coach'     AND rn <= 30)
       OR (type = 'self'      AND rn <= 10)
       OR (type = 'supporter' AND rn <= 10)
  );
END;
$$;
