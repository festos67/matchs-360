
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-logos', 'club-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Club logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'club-logos');

CREATE POLICY "Admins can manage club logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Admins can update club logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
);

CREATE POLICY "Admins can delete club logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'club-logos'
  AND (
    public.is_admin(auth.uid())
    OR public.is_club_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  )
);
