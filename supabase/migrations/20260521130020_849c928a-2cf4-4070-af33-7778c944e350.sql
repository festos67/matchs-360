BEGIN;

-- ============================================================
-- Phase 1 conformite mineurs : socle de detection (double seuil legal FR)
-- 15 ans = RGPD art. 8 FR (consentement parental traitement donnees)
-- 18 ans = majorite legale / droit a l'image (art. 9 CC)
-- ============================================================

-- Helper pur : age en annees revolues. NULL si birthdate inconnue.
CREATE OR REPLACE FUNCTION public.age_years(_birthdate date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _birthdate IS NULL THEN NULL
    ELSE date_part('year', age(CURRENT_DATE, _birthdate))::integer
  END;
$$;

-- is_minor : minorite legale (< 18 ans). Droit a l'image (art. 9 CC).
-- NULL birthdate -> FALSE (grandfathering pre-Phase-0).
CREATE OR REPLACE FUNCTION public.is_minor(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.birthdate IS NULL THEN false
    ELSE p.birthdate > (CURRENT_DATE - INTERVAL '18 years')
  END
  FROM public.profiles p
  WHERE p.id = _profile_id;
$$;

-- requires_parental_consent : seuil RGPD art. 8 FR (< 15 ans).
-- Declenche le workflow consentement parental en Phase 2.
CREATE OR REPLACE FUNCTION public.requires_parental_consent(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.birthdate IS NULL THEN false
    ELSE p.birthdate > (CURRENT_DATE - INTERVAL '15 years')
  END
  FROM public.profiles p
  WHERE p.id = _profile_id;
$$;

-- needs_age_verification : birthdate inconnue -> a backfiller.
CREATE OR REPLACE FUNCTION public.needs_age_verification(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (p.birthdate IS NULL)
  FROM public.profiles p
  WHERE p.id = _profile_id AND p.deleted_at IS NULL;
$$;

-- Categorie d'age sur les equipes (label manuel saisi par le club_admin).
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS age_category text;

COMMENT ON COLUMN public.teams.age_category IS
  'Phase 1 mineurs : categorie d''age de l''equipe (U7..U19, Senior, etc.). '
  'Saisie manuelle (label). team_has_minors() reste la source de verite calculee.';

-- team_has_minors : TRUE si >=1 membre actif est mineur (< 18). Source de verite.
CREATE OR REPLACE FUNCTION public.team_has_minors(_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members tm
    JOIN public.profiles p ON p.id = tm.user_id
    WHERE tm.team_id = _team_id
      AND tm.is_active = true
      AND tm.deleted_at IS NULL
      AND p.birthdate IS NOT NULL
      AND p.birthdate > (CURRENT_DATE - INTERVAL '18 years')
  );
$$;

-- Vue de backfill : profils actifs sans date de naissance.
CREATE OR REPLACE VIEW public.profiles_needing_birthdate AS
  SELECT p.id, p.first_name, p.last_name, p.email, p.club_id, p.created_at
  FROM public.profiles p
  WHERE p.birthdate IS NULL AND p.deleted_at IS NULL;

-- GRANTS : anti-oracle (REVOKE anon).
REVOKE ALL ON FUNCTION public.is_minor(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.requires_parental_consent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.needs_age_verification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_has_minors(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_minor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.requires_parental_consent(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.needs_age_verification(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.team_has_minors(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_minor(uuid) IS
  'Phase 1 : minorite legale < 18 ans (droit a l''image art. 9 CC). NULL birthdate -> false (grandfathering pre-Phase-0). NE PAS confondre avec requires_parental_consent (15 ans).';
COMMENT ON FUNCTION public.requires_parental_consent(uuid) IS
  'Phase 1 : seuil RGPD art. 8 FR < 15 ans (consentement parental traitement). Declenche workflow Phase 2. NE PAS confondre avec is_minor (18 ans / droit image).';
COMMENT ON FUNCTION public.needs_age_verification(uuid) IS
  'Phase 1 : profil sans birthdate. Cible la campagne backfill (vue profiles_needing_birthdate).';
COMMENT ON FUNCTION public.team_has_minors(uuid) IS
  'Phase 1 : source de verite calculee (>=1 membre actif < 18 ans). Independante du label manuel age_category.';

-- Note : le trigger block_minor_signup_phase0 (seuil 18) reste actif.
-- Il sera leve apres construction complete des protections (fin Phase 6),
-- pas dans cette migration.

COMMIT;