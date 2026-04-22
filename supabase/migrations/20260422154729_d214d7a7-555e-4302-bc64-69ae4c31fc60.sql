-- 1) Restrict MIME types and file sizes at the bucket level
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[],
    file_size_limit = 5242880  -- 5 MB
WHERE id = 'user-photos';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']::text[],
    file_size_limit = 5242880  -- 5 MB (we keep SVG for logos but harden via validate_storage_url + RLS)
WHERE id = 'club-logos';

-- Actually drop SVG from club-logos too — safer
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[],
    file_size_limit = 5242880
WHERE id = 'club-logos';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain','text/csv'
    ]::text[],
    file_size_limit = 26214400  -- 25 MB
WHERE id = 'objective-attachments';

-- 2) Harden RLS on club-logos: only club admins can write to <club_id>/...
DROP POLICY IF EXISTS "Authenticated can upload club logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update club logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete club logos" ON storage.objects;
DROP POLICY IF EXISTS "Club admins manage club-logos insert" ON storage.objects;
DROP POLICY IF EXISTS "Club admins manage club-logos update" ON storage.objects;
DROP POLICY IF EXISTS "Club admins manage club-logos delete" ON storage.objects;

CREATE POLICY "Club admins manage club-logos insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "Club admins manage club-logos update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
)
WITH CHECK (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY "Club admins manage club-logos delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

-- 3) Harden validate_storage_url to also reject dangerous extensions
CREATE OR REPLACE FUNCTION public.validate_storage_url(_url text, _bucket text)
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
    -- Allow PDF/doc/etc only on objective-attachments (private bucket, no public URL anyway)
    IF _bucket = 'objective-attachments' AND v_ext IN ('pdf','doc','docx','xls','xlsx','txt','csv') THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;