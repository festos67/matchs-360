-- =============================================================================
-- Migration : role_escalation_defense
-- =============================================================================
-- Faille corrigée :
--   Audit C2 — escalade possible 'player → admin' via auto-demande dans
--   role_requests + approbation distraite par un super-admin. Aucune couche
--   défensive n'empêchait l'INSERT 'admin' ni l'INSERT correspondant dans
--   user_roles par un non-admin.
--
-- 3 couches mises en place :
--   1) CHECK constraint sur role_requests.requested_role : impossible
--      d'enregistrer une demande 'admin' (rejet à l'INSERT côté DB).
--   2) Trigger BEFORE INSERT/UPDATE sur user_roles : seul service_role ou
--      un admin existant peut accorder un rôle privilégié.
--   3) (front) Warning UI + AlertDialog dans RoleApprovals.tsx.
--
-- Rôles privilégiés gelés (KEEP IN SYNC avec src/pages/RoleApprovals.tsx) :
--   - 'admin' (super-admin global, source de vérité is_admin())
--   NB: 'club_admin' n'est PAS inclus (scoped à un club, pas global).
--
-- Bypass autorisés :
--   - service_role (edge functions admin-users, send-invitation, jobs cron,
--     bootstrap initial)
--   - public.is_admin(auth.uid()) (admin existant promeut un autre user)
--
-- Inventaire préalable (read_query 2026-04-23) :
--   - role_requests pending avec requested_role='admin' : 0 (rien à nettoyer)
--   - role_requests historiques avec requested_role='admin' : 0
--   - user_roles role='admin' existants : 1 (préservé)
--   - Triggers préexistants user_roles : trg_audit_user_roles (préservé)
--   - Triggers préexistants role_requests : update_role_requests_updated_at
--     (préservé) ; PAS d'audit trigger → ajouté ici
-- =============================================================================

-- ---- Étape 2a : Nettoyage défensif (idempotent, no-op si rien à nettoyer) --
UPDATE public.role_requests
SET status = 'rejected',
    rejection_reason = COALESCE(rejection_reason, '') ||
      CASE WHEN COALESCE(rejection_reason,'') = '' THEN '' ELSE ' | ' END ||
      'auto-rejected: privileged role via self-request flow',
    reviewed_at = COALESCE(reviewed_at, now())
WHERE requested_role = 'admin'
  AND status = 'pending';

-- ---- Étape 2b/c : CHECK constraint en deux temps (NOT VALID puis VALIDATE) --
ALTER TABLE public.role_requests
  DROP CONSTRAINT IF EXISTS role_requests_no_privileged_request;

ALTER TABLE public.role_requests
  ADD CONSTRAINT role_requests_no_privileged_request
  CHECK (requested_role <> 'admin') NOT VALID;

ALTER TABLE public.role_requests
  VALIDATE CONSTRAINT role_requests_no_privileged_request;

-- ---- Étape 3 : Trigger BEFORE INSERT/UPDATE sur user_roles ------------------
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
  IF NEW.role <> 'admin' THEN
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

DROP TRIGGER IF EXISTS trg_guard_privileged_role_grant ON public.user_roles;

CREATE TRIGGER trg_guard_privileged_role_grant
BEFORE INSERT OR UPDATE OF role ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.guard_privileged_role_grant();

-- ---- Étape 4 : Audit trail role_requests (manquant) -------------------------
DROP TRIGGER IF EXISTS trg_audit_role_requests ON public.role_requests;

CREATE TRIGGER trg_audit_role_requests
AFTER INSERT OR UPDATE OR DELETE ON public.role_requests
FOR EACH ROW
EXECUTE FUNCTION public.fn_audit_trigger();