-- F-502 — Enforce owner-segment check in validate_storage_url
-- Previously validate_storage_url only verified host/scheme/bucket/extension.
-- A club_admin could set logo_url to another club's storage path (content spoofing).
-- We now require the first path segment to match the owning entity id.

-- 1) Extend validate_storage_url with optional _owner_segment param.
--    NULL = legacy behavior (no owner check). Triggers below pass NEW.id::text.
CREATE OR REPLACE FUNCTION public.validate_storage_url(
  _url text,
  _bucket text,
  _owner_segment text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_host text;
  v_expected_prefix text;
  v_path text;
  v_ext text;
  v_relative text;
  v_first_seg text;
BEGIN
  IF _url IS NULL OR _url = '' THEN
    RETURN true;
  END IF;
  IF length(_url) > 2048 THEN
    RETURN false;
  END IF;
  IF _url !~* '^https://' THEN
    RETURN false;
  END IF;
  IF _url ~ '[[:space:]<>"]' THEN
    RETURN false;
  END IF;
  v_supabase_host := 'aasihxqsasjpszqjlbid.supabase.co';
  v_expected_prefix := 'https://' || v_supabase_host || '/storage/v1/object/public/' || _bucket || '/';
  IF position(v_expected_prefix in _url) <> 1 THEN
    RETURN false;
  END IF;

  -- Strip query string, then check extension whitelist (defense in depth)
  v_path := split_part(_url, '?', 1);
  v_ext := lower(substring(v_path from '\.([a-zA-Z0-9]+)$'));
  IF v_ext IS NULL OR v_ext NOT IN ('jpg','jpeg','png','webp','gif') THEN
    IF _bucket = 'objective-attachments' AND v_ext IN ('pdf','doc','docx','xls','xlsx','txt','csv') THEN
      -- still enforce owner segment if provided
      NULL;
    ELSE
      RETURN false;
    END IF;
  END IF;

  -- Owner segment enforcement: the first path segment after the bucket
  -- must equal the expected owner id (e.g. profile id or club id).
  IF _owner_segment IS NOT NULL THEN
    v_relative := substring(v_path from length(v_expected_prefix) + 1);
    v_first_seg := split_part(v_relative, '/', 1);
    IF v_first_seg IS NULL OR v_first_seg = '' OR v_first_seg <> _owner_segment THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

-- 2) Update guard_profile_photo_url to enforce owner = profile id
CREATE OR REPLACE FUNCTION public.guard_profile_photo_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.photo_url IS DISTINCT FROM COALESCE(OLD.photo_url, '') THEN
    IF NOT public.validate_storage_url(NEW.photo_url, 'user-photos', NEW.id::text) THEN
      RAISE EXCEPTION 'Invalid storage URL for photo_url'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Update guard_club_logo_url to enforce owner = club id
CREATE OR REPLACE FUNCTION public.guard_club_logo_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.logo_url IS DISTINCT FROM COALESCE(OLD.logo_url, '') THEN
    IF NOT public.validate_storage_url(NEW.logo_url, 'club-logos', NEW.id::text) THEN
      RAISE EXCEPTION 'Invalid storage URL for logo_url'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;