-- SECURITY: validate user-controlled URL fields at the DB layer.
-- Closes the gap left by the RLS-direct write path for profiles.photo_url
-- and clubs.logo_url. Edge function service_role writes bypass this check
-- (service_role is trusted; webhooks/jobs).

CREATE OR REPLACE FUNCTION public.validate_storage_url(
  _url text,
  _bucket text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_supabase_host text;
  v_expected_prefix text;
BEGIN
  IF _url IS NULL OR _url = '' THEN
    RETURN true;
  END IF;
  IF length(_url) > 2048 THEN
    RETURN false;
  END IF;
  -- Must be HTTPS
  IF _url !~* '^https://' THEN
    RETURN false;
  END IF;
  -- Reject control chars and whitespace inside URL
  IF _url ~ '[[:space:]<>"]' THEN
    RETURN false;
  END IF;
  -- Must point to this project's Supabase Storage public bucket.
  -- Host is hardcoded here (project ref is stable per environment).
  v_supabase_host := 'aasihxqsasjpszqjlbid.supabase.co';
  v_expected_prefix := 'https://' || v_supabase_host || '/storage/v1/object/public/' || _bucket || '/';
  IF position(v_expected_prefix in _url) <> 1 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- Trigger: profiles.photo_url
CREATE OR REPLACE FUNCTION public.guard_profile_photo_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role bypasses (legitimate uploads/migrations)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.photo_url IS DISTINCT FROM COALESCE(OLD.photo_url, NULL) THEN
    IF NOT public.validate_storage_url(NEW.photo_url, 'user-photos') THEN
      RAISE EXCEPTION 'Invalid photo_url: must be HTTPS URL on Supabase user-photos bucket'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_photo_url ON public.profiles;
CREATE TRIGGER trg_guard_profile_photo_url
BEFORE INSERT OR UPDATE OF photo_url ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_photo_url();

-- Trigger: clubs.logo_url
CREATE OR REPLACE FUNCTION public.guard_club_logo_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.logo_url IS DISTINCT FROM COALESCE(OLD.logo_url, NULL) THEN
    IF NOT public.validate_storage_url(NEW.logo_url, 'club-logos') THEN
      RAISE EXCEPTION 'Invalid logo_url: must be HTTPS URL on Supabase club-logos bucket'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_club_logo_url ON public.clubs;
CREATE TRIGGER trg_guard_club_logo_url
BEFORE INSERT OR UPDATE OF logo_url ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.guard_club_logo_url();