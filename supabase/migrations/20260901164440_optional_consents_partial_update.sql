-- =====================================================================
-- CORRECTIF — set_minor_optional_consents ecrivait TOUJOURS les deux
-- consentements, l'appelant devant reconstruire celui qu'il ne modifiait pas.
--
-- MyConsents recalculait l'etat « non touche » depuis une lecture de profiles
-- dont l'erreur n'etait pas recuperee. Si cette lecture echouait ou ne
-- renvoyait rien, les deux valeurs retombaient a false et basculer UN
-- consentement REVOQUAIT silencieusement l'autre — avec un toast de succes.
--
-- Plutot que de rafistoler l'appelant, on supprime la classe de bug : NULL
-- signifie desormais « ne pas toucher ». Un appelant ne peut plus revoquer
-- par omission ce qu'il n'a pas voulu modifier.
--
-- Retro-compatible : un appel passant deux booleens explicites se comporte
-- exactement comme avant.
--
-- Verifie apres application (test joue puis annule) : revoquer la photo en
-- omettant l'auto-evaluation laisse cette derniere intacte.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_minor_optional_consents(
  _minor_id uuid,
  _photo boolean DEFAULT NULL,
  _self_eval boolean DEFAULT NULL
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

  IF NOT public.is_legal_guardian_of(v_guardian, _minor_id) THEN
    RAISE EXCEPTION 'NOT_LEGAL_GUARDIAN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles p
     SET image_rights_consent_at = CASE
           WHEN _photo IS NULL THEN p.image_rights_consent_at
           WHEN _photo THEN coalesce(p.image_rights_consent_at, now())
           ELSE NULL END,
         image_rights_consent_by = CASE
           WHEN _photo IS NULL THEN p.image_rights_consent_by
           WHEN _photo THEN coalesce(p.image_rights_consent_by, v_guardian)
           ELSE NULL END,
         self_eval_consent_at = CASE
           WHEN _self_eval IS NULL THEN p.self_eval_consent_at
           WHEN _self_eval THEN coalesce(p.self_eval_consent_at, now())
           ELSE NULL END,
         self_eval_consent_by = CASE
           WHEN _self_eval IS NULL THEN p.self_eval_consent_by
           WHEN _self_eval THEN coalesce(p.self_eval_consent_by, v_guardian)
           ELSE NULL END
   WHERE p.id = _minor_id;

  -- La trace ne consigne que ce qui a effectivement ete demande.
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, after_data)
  VALUES (
    v_guardian,
    'guardian',
    'parental_consent_updated',
    'profiles',
    _minor_id,
    jsonb_strip_nulls(jsonb_build_object('photo', _photo, 'self_evaluation', _self_eval))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_minor_optional_consents(uuid, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_minor_optional_consents(uuid, boolean, boolean) TO authenticated;
