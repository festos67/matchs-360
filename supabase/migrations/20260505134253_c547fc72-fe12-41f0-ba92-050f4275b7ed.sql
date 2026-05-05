-- Allow club admins to upload/update/delete photos in user-photos bucket
-- for users belonging to a club they administer. Needed when a club admin
-- invites a coach/player and uploads their initial photo.

CREATE POLICY "Club admin upload user-photos in club"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'user-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND public.is_club_admin(auth.uid(), p.club_id)
  )
);

CREATE POLICY "Club admin update user-photos in club"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'user-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND public.is_club_admin(auth.uid(), p.club_id)
  )
);

CREATE POLICY "Club admin delete user-photos in club"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'user-photos'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND public.is_club_admin(auth.uid(), p.club_id)
  )
);
