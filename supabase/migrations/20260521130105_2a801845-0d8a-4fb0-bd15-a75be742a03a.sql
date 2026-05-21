BEGIN;

-- Force SECURITY INVOKER sur la vue de backfill (corrige lint 0010).
ALTER VIEW public.profiles_needing_birthdate SET (security_invoker = true);

-- Verrouille search_path sur age_years (corrige lint 0011).
CREATE OR REPLACE FUNCTION public.age_years(_birthdate date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _birthdate IS NULL THEN NULL
    ELSE date_part('year', age(CURRENT_DATE, _birthdate))::integer
  END;
$$;

COMMIT;