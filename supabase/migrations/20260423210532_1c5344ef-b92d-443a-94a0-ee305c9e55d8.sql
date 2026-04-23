-- ============================================================
-- F2 : Lock hard-delete on profiles + soft-delete enforcement
-- ============================================================

-- 1. Drop the existing FOR ALL admin policy on profiles
DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;

-- 2. Recreate per-action admin policies WITHOUT a DELETE policy
CREATE POLICY "Admins can select profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- (No DELETE policy = DELETE forbidden via PostgREST for authenticated)

-- 3. Defense in depth: BEFORE DELETE trigger that RAISES
--    Catches any future regression where a DELETE policy might be re-added by mistake.
--    service_role still bypasses (legitimate GDPR jobs / scheduled purges).
CREATE OR REPLACE FUNCTION public.prevent_profile_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Hard delete on profiles is forbidden. Use UPDATE deleted_at = now() instead.'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_hard_delete ON public.profiles;
CREATE TRIGGER trg_prevent_profile_hard_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_hard_delete();

-- 4. Partial index on active profiles for SELECT performance
CREATE INDEX IF NOT EXISTS idx_profiles_not_deleted
  ON public.profiles (id)
  WHERE deleted_at IS NULL;