-- F-202 — Lock down audit_log INSERTs to SECURITY DEFINER triggers only
-- Removes the permissive "Triggers can insert audit_log" policy that allowed
-- any authenticated client to forge audit entries via PostgREST.

DROP POLICY IF EXISTS "Triggers can insert audit_log" ON public.audit_log;

-- Revoke direct table privileges from public-facing roles.
-- SECURITY DEFINER triggers (owned by postgres) keep writing — they bypass
-- RLS and use the owner's grants, not the caller's.
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon, PUBLIC;

-- Service role keeps full access for edge functions / maintenance.
GRANT INSERT ON public.audit_log TO service_role;