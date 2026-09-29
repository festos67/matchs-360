-- =====================================================================
-- Photos de joueurs mineurs : le responsable du club peut les ajouter,
-- remplacer et supprimer.
--
-- Le bucket privé user-photos-minors autorisait l'écriture à
-- l'administrateur, au représentant légal et au coach du joueur, mais PAS
-- au responsable du club (qui pouvait seulement lire) : l'ajout d'une photo
-- depuis « Modifier joueur » échouait pour lui. L'affichage reste soumis à
-- l'autorisation photo donnée par le représentant légal
-- (image_rights_consent_at, masquage côté client).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_club_admin_of_player(_user_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Garde anti-oracle F-205, identique aux fonctions soeurs.
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.teams t ON t.id = tm.team_id
    WHERE tm.user_id = _player_id
      AND tm.member_type = 'player'
      AND tm.is_active
      AND tm.deleted_at IS NULL
      AND public.is_club_admin(_user_id, t.club_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _player_id
      AND p.club_id IS NOT NULL
      AND public.is_club_admin(_user_id, p.club_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_club_admin_of_player(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_club_admin_of_player(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Club admins manage club minor photos" ON storage.objects;
CREATE POLICY "Club admins manage club minor photos"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'user-photos-minors'
  AND public.is_club_admin_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'user-photos-minors'
  AND public.is_club_admin_of_player(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
