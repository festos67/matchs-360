CREATE OR REPLACE FUNCTION public.validate_storage_url(_url text, _bucket text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_host text;
  v_expected_prefix text;
  v_path text;
  v_ext text;
BEGIN
  IF _url IS NULL OR _url = '' THEN RETURN true; END IF;
  IF length(_url) > 2048 THEN RETURN false; END IF;
  IF _url !~* '^https://' THEN RETURN false; END IF;
  IF _url ~ '[[:space:]<>"]' THEN RETURN false; END IF;
  v_supabase_host := 'zsossagpsxtjbloxxetq.supabase.co';
  v_expected_prefix := 'https://' || v_supabase_host || '/storage/v1/object/public/' || _bucket || '/';
  IF position(v_expected_prefix in _url) <> 1 THEN RETURN false; END IF;
  v_path := split_part(_url, '?', 1);
  v_ext := lower(substring(v_path from '[.]([a-zA-Z0-9]+)$'));
  IF v_ext IS NULL OR v_ext NOT IN ('jpg','jpeg','png','webp','gif') THEN
    IF _bucket = 'objective-attachments' AND v_ext IN ('pdf','doc','docx','xls','xlsx','txt','csv') THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_storage_url(_url text, _bucket text, _owner_segment text DEFAULT NULL::text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_host text;
  v_expected_prefix text;
  v_path text;
  v_ext text;
  v_relative text;
  v_first_seg text;
BEGIN
  IF _url IS NULL OR _url = '' THEN RETURN true; END IF;
  IF length(_url) > 2048 THEN RETURN false; END IF;
  IF _url !~* '^https://' THEN RETURN false; END IF;
  IF _url ~ '[[:space:]<>"]' THEN RETURN false; END IF;
  v_supabase_host := 'zsossagpsxtjbloxxetq.supabase.co';
  v_expected_prefix := 'https://' || v_supabase_host || '/storage/v1/object/public/' || _bucket || '/';
  IF position(v_expected_prefix in _url) <> 1 THEN RETURN false; END IF;
  v_path := split_part(_url, '?', 1);
  v_ext := lower(substring(v_path from '[.]([a-zA-Z0-9]+)$'));
  IF v_ext IS NULL OR v_ext NOT IN ('jpg','jpeg','png','webp','gif') THEN
    IF _bucket = 'objective-attachments' AND v_ext IN ('pdf','doc','docx','xls','xlsx','txt','csv') THEN
      NULL;
    ELSE
      RETURN false;
    END IF;
  END IF;
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