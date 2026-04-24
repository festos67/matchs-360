-- F-309 — Defense-in-depth: trigger guard on role_requests INSERT
-- Even if RLS were ever disabled or bypassed (service_role misuse), this
-- BEFORE INSERT trigger ensures:
--   1) user_id MUST equal auth.uid() (no inserting on behalf of others)
--   2) status MUST be 'pending' on creation (no self-approval at insert time)
-- The existing CHECK constraint already blocks requested_role IN ('admin','club_admin').

CREATE OR REPLACE FUNCTION public.guard_role_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Allow service_role (edge functions) to bypass uid check; it has its own audit
  IF auth.role() = 'service_role' THEN
    -- still force pending on creation
    IF NEW.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'role_requests must be created with status=pending'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'role_requests insert requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'role_requests.user_id must match auth.uid()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'role_requests must be created with status=pending'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reset reviewer fields just in case the client tries to seed them
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.rejection_reason := NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_role_request_insert ON public.role_requests;
CREATE TRIGGER trg_guard_role_request_insert
BEFORE INSERT ON public.role_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_role_request_insert();