-- Cycle 4 #7 — Lock LIST on public storage buckets
-- Closes linter warnings "Public Bucket Allows Listing" on user-photos and club-logos.
-- Preserves public GET via direct URL (bucket.public=true bypasses RLS at the CDN gateway).

DROP POLICY IF EXISTS "Users can list own user-photos folder" ON storage.objects;
DROP POLICY IF EXISTS "Admins can list all user-photos" ON storage.objects;
DROP POLICY IF EXISTS "Club members can list club-logos folder" ON storage.objects;
DROP POLICY IF EXISTS "Club admins can list club-logos folder" ON storage.objects;
DROP POLICY IF EXISTS "Admins can list all club-logos" ON storage.objects;

-- 1. user-photos : self-folder + admins only
CREATE POLICY "Users can list own user-photos folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-photos'
  AND (
    public.is_admin(auth.uid())
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

-- 2. club-logos : admins + club_admin of that club only
CREATE POLICY "Club admins can list club-logos folder"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);