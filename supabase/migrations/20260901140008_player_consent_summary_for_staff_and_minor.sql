-- =====================================================================
-- Acces a l'attestation depuis la fiche joueur.
--
-- Constat : la policy « Guardian views own consents » limite la lecture de
-- parental_consents au signataire et au super-admin. Verifie en base : un
-- coach REFERENT dont le joueur a effectivement consenti lit 0 ligne. Sans
-- identifiant de consentement, LegalGuardianModal ne peut pas construire le
-- lien vers l'attestation.
--
-- On n'elargit PAS la policy (elle exposerait signed_ip / signed_user_agent
-- a tout l'encadrement) : une RPC renvoie le strict minimum permettant de
-- construire le lien — identifiant et statut.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_player_consent_summary(_player_id uuid)
RETURNS TABLE (
  consent_id uuid,
  signed_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pc.id, pc.signed_at, pc.revoked_at
  FROM public.parental_consents pc
  WHERE pc.minor_profile_id = _player_id
    AND (
      pc.guardian_profile_id = auth.uid()
      OR pc.minor_profile_id = auth.uid()   -- l'enfant concerne
      OR public.is_admin(auth.uid())
      OR public.is_coach_of_player(auth.uid(), pc.minor_profile_id)
      OR public.is_club_admin(auth.uid(), public.get_player_club_id(pc.minor_profile_id))
    )
  ORDER BY pc.signed_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_player_consent_summary(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_player_consent_summary(uuid) TO authenticated;

-- L'enfant concerne peut consulter l'attestation qui le vise : c'est le
-- traitement de ses propres donnees. Ajout de la seule branche manquante,
-- le reste de la fonction est inchange.
CREATE OR REPLACE FUNCTION public.get_parental_consent_attestation(_consent_id uuid)
RETURNS TABLE (
  consent_id uuid,
  minor_first_name text,
  minor_last_name text,
  guardian_first_name text,
  guardian_last_name text,
  guardian_email text,
  relationship text,
  club_name text,
  signed_at timestamptz,
  revoked_at timestamptz,
  photo_consent_at timestamptz,
  self_eval_consent_at timestamptz,
  consent_scope jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pc.id,
    m.first_name,
    m.last_name,
    g.first_name,
    g.last_name,
    g.email,
    pc.relationship::text,
    c.name,
    pc.signed_at,
    pc.revoked_at,
    m.image_rights_consent_at,
    m.self_eval_consent_at,
    pc.consent_scope
  FROM public.parental_consents pc
  JOIN public.profiles m ON m.id = pc.minor_profile_id
  LEFT JOIN public.profiles g ON g.id = pc.guardian_profile_id
  LEFT JOIN public.clubs c ON c.id = m.club_id
  WHERE pc.id = _consent_id
    AND (
      pc.guardian_profile_id = auth.uid()
      OR pc.minor_profile_id = auth.uid()
      OR public.is_admin(auth.uid())
      OR public.is_coach_of_player(auth.uid(), pc.minor_profile_id)
      OR public.is_club_admin(auth.uid(), public.get_player_club_id(pc.minor_profile_id))
    );
$$;

REVOKE ALL ON FUNCTION public.get_parental_consent_attestation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_parental_consent_attestation(uuid) TO authenticated;
