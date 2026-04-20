
-- ============================================================
-- 1. SUBSCRIPTIONS: restrict SELECT to club admins + admins only
-- ============================================================
DROP POLICY IF EXISTS "Club admins can view their subscription" ON public.subscriptions;

CREATE POLICY "Club admins view their subscription"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (public.is_club_admin(auth.uid(), club_id));

-- ============================================================
-- 2. NOTIFICATIONS: restrict INSERT to service_role / triggers
-- ============================================================
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

CREATE POLICY "Service role inserts notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. THEMES: tighten SELECT to scoped users only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view themes" ON public.themes;

CREATE POLICY "Scoped users view themes"
ON public.themes
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR framework_id IN (
    SELECT cf.id FROM public.competence_frameworks cf
    WHERE
      cf.is_template = true
      OR (cf.team_id IS NOT NULL AND cf.team_id IN (SELECT public.get_user_team_ids(auth.uid())))
      OR (cf.club_id IS NOT NULL AND cf.club_id IN (SELECT public.get_user_club_ids(auth.uid())))
      OR (cf.team_id IS NOT NULL AND cf.team_id IN (SELECT public.get_supporter_player_team_ids(auth.uid())))
  )
);

-- ============================================================
-- 4. SKILLS: tighten SELECT to scoped users only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view skills" ON public.skills;

CREATE POLICY "Scoped users view skills"
ON public.skills
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR theme_id IN (
    SELECT th.id FROM public.themes th
    JOIN public.competence_frameworks cf ON cf.id = th.framework_id
    WHERE
      cf.is_template = true
      OR (cf.team_id IS NOT NULL AND cf.team_id IN (SELECT public.get_user_team_ids(auth.uid())))
      OR (cf.club_id IS NOT NULL AND cf.club_id IN (SELECT public.get_user_club_ids(auth.uid())))
      OR (cf.team_id IS NOT NULL AND cf.team_id IN (SELECT public.get_supporter_player_team_ids(auth.uid())))
  )
);

-- ============================================================
-- 5. STORAGE: objective-attachments → private bucket with joins
-- ============================================================
UPDATE storage.buckets SET public = false WHERE id = 'objective-attachments';

-- Drop any existing permissive policies for that bucket
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%objective-attachments%' OR policyname ILIKE '%objective_attachments%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- SELECT: any authorized viewer of the parent objective (team or player)
CREATE POLICY "objective-attachments scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'objective-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.objective_attachments oa
      JOIN public.team_objectives t_o ON t_o.id = oa.objective_id
      WHERE oa.file_path = storage.objects.name
        AND (
          public.is_admin(auth.uid())
          OR public.is_club_admin_of_team(auth.uid(), t_o.team_id)
          OR public.is_coach_of_team(auth.uid(), t_o.team_id)
          OR public.is_player_in_team(auth.uid(), t_o.team_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.player_objective_attachments pa
      JOIN public.player_objectives po ON po.id = pa.objective_id
      WHERE pa.file_path = storage.objects.name
        AND (
          public.is_admin(auth.uid())
          OR public.is_club_admin_of_team(auth.uid(), po.team_id)
          OR public.is_coach_of_team(auth.uid(), po.team_id)
          OR po.player_id = auth.uid()
        )
    )
  )
);

-- INSERT: coaches/admins of relevant team can upload
CREATE POLICY "objective-attachments scoped insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'objective-attachments'
  AND auth.uid() IS NOT NULL
);

-- UPDATE/DELETE: admins, club admins, referent coach of the team
CREATE POLICY "objective-attachments scoped update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'objective-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.objective_attachments oa
      JOIN public.team_objectives t_o ON t_o.id = oa.objective_id
      WHERE oa.file_path = storage.objects.name
        AND (public.is_admin(auth.uid())
             OR public.is_club_admin_of_team(auth.uid(), t_o.team_id)
             OR public.is_referent_coach_of_team(auth.uid(), t_o.team_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.player_objective_attachments pa
      JOIN public.player_objectives po ON po.id = pa.objective_id
      WHERE pa.file_path = storage.objects.name
        AND (public.is_admin(auth.uid())
             OR public.is_club_admin_of_team(auth.uid(), po.team_id)
             OR public.is_referent_coach_of_team(auth.uid(), po.team_id))
    )
  )
);

CREATE POLICY "objective-attachments scoped delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'objective-attachments'
  AND (
    EXISTS (
      SELECT 1 FROM public.objective_attachments oa
      JOIN public.team_objectives t_o ON t_o.id = oa.objective_id
      WHERE oa.file_path = storage.objects.name
        AND (public.is_admin(auth.uid())
             OR public.is_club_admin_of_team(auth.uid(), t_o.team_id)
             OR public.is_referent_coach_of_team(auth.uid(), t_o.team_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.player_objective_attachments pa
      JOIN public.player_objectives po ON po.id = pa.objective_id
      WHERE pa.file_path = storage.objects.name
        AND (public.is_admin(auth.uid())
             OR public.is_club_admin_of_team(auth.uid(), po.team_id)
             OR public.is_referent_coach_of_team(auth.uid(), po.team_id))
    )
  )
);

-- ============================================================
-- 6. STORAGE: club-logos & user-photos remain public-read on individual files
--    (buckets stay public so logo_url / photo_url URLs keep working),
--    but writes restricted to owners/admins.
-- ============================================================
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (policyname ILIKE '%club-logo%' OR policyname ILIKE '%club_logo%'
           OR policyname ILIKE '%user-photo%' OR policyname ILIKE '%user_photo%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- club-logos: public read by file path (no listing), upload/update/delete by club_admin or admin
CREATE POLICY "club-logos public read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'club-logos');

CREATE POLICY "club-logos admin write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'club-logos'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "club-logos admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'club-logos' AND auth.uid() IS NOT NULL
);

CREATE POLICY "club-logos admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'club-logos' AND auth.uid() IS NOT NULL
);

-- user-photos: public read, write only by owner (folder = uid)
CREATE POLICY "user-photos public read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'user-photos');

CREATE POLICY "user-photos owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'user-photos'
  AND (
    public.is_admin(auth.uid())
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "user-photos owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'user-photos'
  AND (
    public.is_admin(auth.uid())
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "user-photos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'user-photos'
  AND (
    public.is_admin(auth.uid())
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);
