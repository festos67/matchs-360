
BEGIN;

-- Bucket privé pour photos de mineurs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-photos-minors',
  'user-photos-minors',
  false,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Colonnes droit à l'image
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS image_rights_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS image_rights_consent_ip inet,
  ADD COLUMN IF NOT EXISTS image_rights_consent_by uuid,
  ADD COLUMN IF NOT EXISTS photo_is_minor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.image_rights_consent_at IS
  'Phase 3 art. 9 CC : date du consentement a la diffusion de la photo. Pour un mineur (<18) le consentant (image_rights_consent_by) DOIT etre un titulaire legal (is_legal_guardian_of). Pour un adulte, lui-meme.';
COMMENT ON COLUMN public.profiles.photo_is_minor IS
  'Phase 3 : true si la photo est stockee dans le bucket prive user-photos-minors (lecture via signed URL).';

-- Helper d'affichage
CREATE OR REPLACE FUNCTION public.photo_display_allowed(_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT image_rights_consent_at IS NOT NULL
  FROM public.profiles WHERE id = _profile_id;
$$;
REVOKE ALL ON FUNCTION public.photo_display_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.photo_display_allowed(uuid) TO authenticated, service_role;

-- Storage policies bucket prive
DROP POLICY IF EXISTS "Minor photos read scoped" ON storage.objects;
CREATE POLICY "Minor photos read scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-photos-minors'
    AND (
      public.is_admin(auth.uid())
      OR public.is_legal_guardian_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.is_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.is_club_admin_of_team(
           auth.uid(),
           (SELECT tm.team_id FROM public.team_members tm
            WHERE tm.user_id = ((storage.foldername(name))[1])::uuid
              AND tm.is_active = true LIMIT 1)
         )
    )
  );

DROP POLICY IF EXISTS "Minor photos insert scoped" ON storage.objects;
CREATE POLICY "Minor photos insert scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-photos-minors'
    AND (
      public.is_admin(auth.uid())
      OR public.is_legal_guardian_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.is_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "Minor photos update scoped" ON storage.objects;
CREATE POLICY "Minor photos update scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'user-photos-minors'
    AND (
      public.is_admin(auth.uid())
      OR public.is_legal_guardian_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.is_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

DROP POLICY IF EXISTS "Minor photos delete scoped" ON storage.objects;
CREATE POLICY "Minor photos delete scoped" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-photos-minors'
    AND (
      public.is_admin(auth.uid())
      OR public.is_legal_guardian_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
      OR public.is_coach_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

-- Durcir objective-attachments (A2-012) : pas d'images
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
]::text[]
WHERE id = 'objective-attachments';

COMMIT;
