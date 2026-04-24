-- F5 — Wizard "Nouveau club" : RPC transactionnelle pour création atomique
-- Remplace le flux INSERT clubs + rollback hard-DELETE par une fonction
-- SECURITY DEFINER qui valide l'authz (super-admin only) et garantit
-- l'atomicité PostgreSQL. L'envoi d'invitation reste géré côté frontend
-- en best-effort post-commit (pas de rollback en cas d'échec Resend).

CREATE OR REPLACE FUNCTION public.create_club_with_referent(
  _name TEXT,
  _short_name TEXT,
  _primary_color TEXT,
  _secondary_color TEXT,
  _referent_first_name TEXT,
  _referent_last_name TEXT,
  _referent_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_club_id UUID;
BEGIN
  -- Authz : seul un super-admin peut créer un club
  IF NOT public.is_admin(v_caller) THEN
    RAISE EXCEPTION 'Forbidden: only super-admin can create a club'
      USING ERRCODE = '42501';
  END IF;

  -- Validation minimale
  IF _name IS NULL OR length(trim(_name)) < 2 THEN
    RAISE EXCEPTION 'Club name must be at least 2 characters'
      USING ERRCODE = '22023';
  END IF;
  IF _referent_email IS NULL OR _referent_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid referent email' USING ERRCODE = '22023';
  END IF;

  -- INSERT atomique du club (colonnes réelles uniquement)
  INSERT INTO public.clubs (
    name,
    short_name,
    primary_color,
    secondary_color,
    referent_name,
    referent_email
  )
  VALUES (
    trim(_name),
    NULLIF(upper(trim(COALESCE(_short_name, ''))), ''),
    COALESCE(_primary_color, '#3B82F6'),
    COALESCE(_secondary_color, '#0A1628'),
    trim(_referent_first_name) || ' ' || trim(_referent_last_name),
    lower(trim(_referent_email))
  )
  RETURNING id INTO v_club_id;

  RETURN jsonb_build_object(
    'club_id', v_club_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_with_referent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_club_with_referent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;