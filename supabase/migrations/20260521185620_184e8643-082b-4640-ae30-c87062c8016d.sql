BEGIN;

-- =========================================================================
-- I8-003 : Enforce profiles.is_active au niveau RLS
-- =========================================================================
-- Avant ce patch, profiles.is_active était écrit par govern_minor_activation,
-- activate_minor_on_consent et resuspend_minor_on_revocation, mais aucun
-- consommateur ne le lisait : un mineur < 15 sans consentement parental
-- pouvait quand même lire/écrire des données via l'API.
--
-- Stratégie : policy RESTRICTIVE par table de données. Les policies
-- restrictives sont AND'ées aux policies permissives existantes → on
-- ajoute le gate sans recréer ni casser les policies métier.
--
-- Exception : la lecture de son propre profil reste autorisée pour que
-- le frontend puisse afficher l'écran d'attente correct.
-- =========================================================================

-- Helper : compte actif ? Conservateur (deny si pas de profil).
CREATE OR REPLACE FUNCTION public.current_account_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.current_account_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_account_active() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_account_active() IS
  'I8-003 : true si profiles.is_active du caller = true. Utilisé en policy RESTRICTIVE pour bloquer un mineur en attente de consentement parental (ou ré-suspendu après révocation art.7§3) de toute lecture/écriture API.';

-- =========================================================================
-- Application du gate (policies RESTRICTIVE, AND'ées aux policies métier)
-- =========================================================================

-- profiles : exception "lire son propre profil" pour permettre à l'UI de
-- savoir qu'on est pending et afficher l'écran d'attente.
DROP POLICY IF EXISTS "restrict_inactive_account" ON public.profiles;
CREATE POLICY "restrict_inactive_account"
  ON public.profiles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (
    public.current_account_active()
    OR id = auth.uid()
  )
  WITH CHECK (
    public.current_account_active()
    OR id = auth.uid()
  );

-- Tables de données applicatives : aucun accès si compte inactif.
DO $$
DECLARE
  t text;
  gated_tables text[] := ARRAY[
    'evaluations',
    'evaluation_scores',
    'evaluation_objectives',
    'team_objectives',
    'player_objectives',
    'objective_attachments',
    'player_objective_attachments',
    'competence_frameworks',
    'framework_snapshots',
    'themes',
    'skills',
    'team_members',
    'teams',
    'clubs',
    'notifications',
    'invitations',
    'supporter_evaluation_requests',
    'supporters_link'
  ];
BEGIN
  FOREACH t IN ARRAY gated_tables LOOP
    -- Skip silencieusement si la table n'existe pas (idempotence cross-env).
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "restrict_inactive_account" ON public.%I', t);
      EXECUTE format($pol$
        CREATE POLICY "restrict_inactive_account"
          ON public.%I
          AS RESTRICTIVE
          FOR ALL
          TO authenticated
          USING (public.current_account_active())
          WITH CHECK (public.current_account_active())
      $pol$, t);
    END IF;
  END LOOP;
END $$;

COMMIT;