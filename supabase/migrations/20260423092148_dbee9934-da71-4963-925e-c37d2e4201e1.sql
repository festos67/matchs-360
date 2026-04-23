-- =============================================================================
-- Migration : extend_privileged_role_defense
-- =============================================================================
-- Faille corrigée :
--   Audit cycle 3 — escalade 'player → club_admin' exploitable via signup
--   public + flow d'auto-demande, et grants 'club_admin' flottants
--   (club_id NULL) corrompant silencieusement le RBAC.
--
-- 4 couches mises en place (extension de la défense cycle 2.5) :
--   1) CHECK role_requests.requested_role étendue à NOT IN ('admin','club_admin')
--   2) Trigger guard_privileged_role_grant étendu à 'club_admin'
--   3) (front) PRIVILEGED_ROLES étendu + retrait club_admin du signup
--      + propagation club_id dans handleApprove
--   4) Nouvelle CHECK user_roles : club_admin REQUIRES club_id NOT NULL
--
-- Rôles privilégiés gelés (KEEP IN SYNC avec src/pages/RoleApprovals.tsx
-- et src/pages/Auth.tsx) : ['admin', 'club_admin']
--
-- Bypass autorisés :
--   - service_role (edge functions admin-users, onboarding clubs, jobs cron)
--   - public.is_admin(auth.uid()) (super-admin existant)
--
-- Inventaire préalable (read_query 2026-04-23) :
--   - role_requests pending requested_role='club_admin' : 0 (rien à nettoyer)
--   - user_roles role='club_admin' AND club_id IS NULL : 0 (CHECK VALIDATE OK)
--   - user_roles role='club_admin' total : 5 (préservés)
--   - user_roles role='admin' total : 3 (préservés)
--   - Triggers préexistants user_roles : trg_audit_user_roles,
--     trg_guard_privileged_role_grant (cycle 2.5 — fonction CREATE OR REPLACE)
--   - Triggers préexistants role_requests : trg_audit_role_requests,
--     update_role_requests_updated_at
-- =============================================================================

-- ---- Étape 2a : Nettoyage défensif (no-op si rien à nettoyer) --------------
UPDATE public.role_requests
SET status = 'rejected',
    rejection_reason = COALESCE(rejection_reason, '') ||
      CASE WHEN COALESCE(rejection_reason,'') = '' THEN '' ELSE ' | ' END ||
      'auto-rejected: club_admin grant must transit via admin invitation flow',
    reviewed_at = COALESCE(reviewed_at, now())
WHERE requested_role = 'club_admin'
  AND status = 'pending';

-- ---- Étape 2b/c : CHECK étendue role_requests (NOT VALID puis VALIDATE) ----
ALTER TABLE public.role_requests
  DROP CONSTRAINT IF EXISTS role_requests_no_privileged_request;

ALTER TABLE public.role_requests
  ADD CONSTRAINT role_requests_no_privileged_request
  CHECK (requested_role NOT IN ('admin', 'club_admin')) NOT VALID;

ALTER TABLE public.role_requests
  VALIDATE CONSTRAINT role_requests_no_privileged_request;

-- ---- Étape 3 : Extension trigger guard_privileged_role_grant ---------------
-- Le trigger trg_guard_privileged_role_grant ON user_roles existe déjà
-- (cycle 2.5). On remplace uniquement la fonction pour étendre la liste.
CREATE OR REPLACE FUNCTION public.guard_privileged_role_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Bypass service_role (edge functions, jobs, bootstrap)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Rôle non sensible : on laisse passer, RLS gère le reste
  IF NEW.role NOT IN ('admin', 'club_admin') THEN
    RETURN NEW;
  END IF;

  -- Rôle privilégié demandé : seul un admin existant peut l'accorder
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Privileged role assignment forbidden: only existing admins or service_role can grant role %', NEW.role
    USING ERRCODE = '42501';
END;
$function$;

-- ---- Étape 4 : CHECK user_roles club_admin REQUIRES club_id ----------------
-- Inventaire : 0 ligne flottante détectée → VALIDATE attendu OK.
-- Si VALIDATE échoue (régression), la migration entière rollback.
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_club_admin_requires_club;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_club_admin_requires_club
  CHECK (role <> 'club_admin' OR club_id IS NOT NULL) NOT VALID;

ALTER TABLE public.user_roles
  VALIDATE CONSTRAINT user_roles_club_admin_requires_club;