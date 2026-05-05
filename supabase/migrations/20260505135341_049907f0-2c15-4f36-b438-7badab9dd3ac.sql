-- Allow coaches to upload/update/delete photos for players they coach
CREATE POLICY "Coach upload user-photos for players"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'user-photos'
  AND is_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Coach update user-photos for players"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'user-photos'
  AND is_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Coach delete user-photos for players"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'user-photos'
  AND is_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
);