-- =====================================================================
-- Revocation des consentements optionnels par le representant legal.
--
-- Constat : profiles n'a AUCUNE policy UPDATE pour un titulaire de
-- l'autorite parentale (seulement : soi-meme, coach du joueur, club_admin
-- du club, admin). Le toggle « droit a l'image » de /my-consents ecrivait
-- donc dans le vide — RLS ne leve pas d'erreur, elle filtre : 0 ligne
-- modifiee, toast de succes trompeur. Verifie en base : un UPDATE joue
-- sous l'identite d'un gardien reel retourne 0 ligne.
--
-- Correction volontairement etroite : plutot qu'une policy UPDATE sur
-- profiles (qui ouvrirait TOUTES les colonnes au parent — nom, email,
-- club_id...), une RPC SECURITY DEFINER limitee aux deux colonnes de
-- consentement optionnel.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_minor_optional_consents(
  _minor_id uuid,
  _photo boolean,
  _self_eval boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guardian uuid := auth.uid();
BEGIN
  IF v_guardian IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Seul un titulaire legal en cours de validite peut modifier ces choix.
  IF NOT public.is_legal_guardian_of(v_guardian, _minor_id) THEN
    RAISE EXCEPTION 'NOT_LEGAL_GUARDIAN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET image_rights_consent_at = CASE WHEN _photo THEN coalesce(image_rights_consent_at, now()) ELSE NULL END,
         image_rights_consent_by = CASE WHEN _photo THEN coalesce(image_rights_consent_by, v_guardian) ELSE NULL END,
         self_eval_consent_at    = CASE WHEN _self_eval THEN coalesce(self_eval_consent_at, now()) ELSE NULL END,
         self_eval_consent_by    = CASE WHEN _self_eval THEN coalesce(self_eval_consent_by, v_guardian) ELSE NULL END
   WHERE id = _minor_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, after_data)
  VALUES (
    v_guardian,
    'guardian',
    'parental_consent_updated',
    'profiles',
    _minor_id,
    jsonb_build_object('photo', _photo, 'self_evaluation', _self_eval)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_minor_optional_consents(uuid, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_minor_optional_consents(uuid, boolean, boolean) TO authenticated;
