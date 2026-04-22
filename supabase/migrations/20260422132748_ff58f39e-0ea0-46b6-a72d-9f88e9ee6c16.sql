
-- Drop overly permissive policies on storage.objects for club-logos
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (
        policyname ILIKE '%club-logos%'
        OR policyname ILIKE '%club_logos%'
        OR policyname ILIKE '%club logo%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Public read access (logos are public)
CREATE POLICY "club-logos: public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'club-logos');

-- INSERT: only admin or club_admin of that club (folder = club_id)
CREATE POLICY "club-logos: admin or club admin insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

-- UPDATE
CREATE POLICY "club-logos: admin or club admin update"
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

-- DELETE
CREATE POLICY "club-logos: admin or club admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);
