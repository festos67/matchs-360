-- =========================================================================
-- AUDIT LOG SYSTEM — append-only forensic trail for sensitive tables
-- =========================================================================

-- 1. Table audit_log (append-only)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  table_name TEXT NOT NULL,
  record_id TEXT,
  before_data JSONB,
  after_data JSONB,
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_name ON public.audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_role ON public.audit_log(actor_role);

-- 2. RLS — append-only
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Lecture : super admins uniquement
CREATE POLICY "Admins can read audit_log"
ON public.audit_log
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Insert : autorisé (les triggers SECURITY DEFINER écrivent au nom du owner)
CREATE POLICY "Triggers can insert audit_log"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Pas de policy UPDATE / DELETE → append-only par construction RLS
-- Révoque explicitement aux rôles applicatifs
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated, anon;

-- 3. Fonction générique de capture
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_record_id TEXT;
  v_request_id TEXT;
  v_headers JSONB;
BEGIN
  -- Acteur
  BEGIN
    v_actor_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;

  BEGIN
    v_actor_role := auth.role();
  EXCEPTION WHEN OTHERS THEN
    v_actor_role := current_user;
  END;

  -- Headers PostgREST (request_id, user-agent, ip)
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
    v_request_id := v_headers ->> 'x-request-id';
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
    v_request_id := NULL;
  END;

  -- record_id (cast id en text si présent)
  IF TG_OP = 'DELETE' THEN
    BEGIN v_record_id := (to_jsonb(OLD) ->> 'id'); EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;
  ELSE
    BEGIN v_record_id := (to_jsonb(NEW) ->> 'id'); EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;
  END IF;

  INSERT INTO public.audit_log (
    actor_id, actor_role, action, table_name, record_id,
    before_data, after_data, request_id, ip_address, user_agent
  ) VALUES (
    v_actor_id,
    v_actor_role,
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    v_request_id,
    v_headers ->> 'x-forwarded-for',
    v_headers ->> 'user-agent'
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4. Triggers AFTER sur les 7 tables sensibles
DROP TRIGGER IF EXISTS trg_audit_subscriptions ON public.subscriptions;
CREATE TRIGGER trg_audit_subscriptions
AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_team_members ON public.team_members;
CREATE TRIGGER trg_audit_team_members
AFTER INSERT OR UPDATE OR DELETE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_clubs ON public.clubs;
CREATE TRIGGER trg_audit_clubs
AFTER INSERT OR UPDATE OR DELETE ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_competence_frameworks ON public.competence_frameworks;
CREATE TRIGGER trg_audit_competence_frameworks
AFTER INSERT OR UPDATE OR DELETE ON public.competence_frameworks
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_invitations ON public.invitations;
CREATE TRIGGER trg_audit_invitations
AFTER INSERT OR UPDATE OR DELETE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- 5. Purge automatique > 1 an (RGPD)
CREATE OR REPLACE FUNCTION public.purge_old_audit_log()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < now() - INTERVAL '1 year';
END;
$$;