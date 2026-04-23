-- =========================================================================
-- Cycle 4 — T-2 fix : empêcher un club_admin de muter profiles.club_id
-- cross-club. Le trigger guard_profile_self_update ne couvre que le cas
-- auth.uid() = NEW.id (self-update). La policy "Club admin update
-- profiles in club" autorise les UPDATE par un club_admin sans contrainte
-- column-level — d'où ce nouveau trigger orthogonal qui gèle club_id
-- pour tout caller non admin / non service_role / non self.
--
-- LIMITATION CONNUE (T15) : les tentatives REJETÉES par ce BEFORE trigger
-- ne sont PAS capturées dans audit_log (rollback). Follow-up possible
-- cycle 5 via table tampering_attempts dédiée.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_admin_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass : service_role (cron, edge functions backend, migrations)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass : super admin (peut faire des transferts cross-club légitimes)
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Bypass : self-update (déjà couvert par guard_profile_self_update)
  IF auth.uid() = NEW.id THEN
    RETURN NEW;
  END IF;

  -- Cas restant : club_admin updating un autre profil dans son scope.
  -- Interdire mutation de club_id (transfert silencieux cross-club).
  IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
    RAISE EXCEPTION 'Cannot modify club_id on profile without admin/service_role authority. Cross-club profile transfers must go through a dedicated RPC (not yet implemented).'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_admin_update ON public.profiles;
CREATE TRIGGER trg_guard_profile_admin_update
BEFORE UPDATE OF club_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_admin_update();

COMMENT ON FUNCTION public.guard_profile_admin_update()
  IS 'Cycle 4 T-2 fix. Blocks non-admin / non-self UPDATE of profiles.club_id (prevents silent cross-club transfer by multi-club_admin). Pairs with guard_profile_self_update (which covers self-update column freeze).';

-- =========================================================================
-- Cycle 4 — T-3 fix : la migration cycle 3 (20260423092148) a refait la
-- FONCTION guard_privileged_role_grant pour étendre à club_admin, mais a
-- oublié de refaire le wiring du trigger. Le trigger reste BEFORE INSERT
-- OR UPDATE OF role uniquement. Un club_admin multi-club peut donc
-- UPDATE user_roles.club_id seul (sans toucher role) sans déclencher
-- le guard. Ce fix : (1) extend la fonction pour gérer le swap club_id,
-- (2) drop+recreate trigger avec liste OF étendue.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.guard_privileged_role_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass service_role (edge functions, jobs, bootstrap)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass : super admin (peut tout faire, transferts inclus)
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Check 1 (existant — préservé) : INSERT ou UPDATE OF role privilégié
  -- doit venir d'admin / service_role.
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role))
     AND NEW.role IN ('admin', 'club_admin') THEN
    RAISE EXCEPTION 'Privileged role assignment forbidden: only existing admins or service_role can grant role %', NEW.role
      USING ERRCODE = '42501';
  END IF;

  -- Check 2 (nouveau cycle 4) : UPDATE OF club_id sur user_roles existant
  -- doit venir d'admin / service_role. Bloque le déplacement silencieux
  -- d'un rôle entre clubs par un club_admin multi-club.
  IF TG_OP = 'UPDATE' AND NEW.club_id IS DISTINCT FROM OLD.club_id THEN
    RAISE EXCEPTION 'Cannot modify club_id on user_roles without admin/service_role authority. Cross-club role transfers must go through a dedicated RPC (not yet implemented).'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- CRITIQUE : drop + recreate avec la nouvelle liste OF.
-- Le trigger précédent était wired "BEFORE INSERT OR UPDATE OF role".
DROP TRIGGER IF EXISTS trg_guard_privileged_role_grant ON public.user_roles;
CREATE TRIGGER trg_guard_privileged_role_grant
BEFORE INSERT OR UPDATE OF role, club_id ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.guard_privileged_role_grant();

COMMENT ON FUNCTION public.guard_privileged_role_grant()
  IS 'Cycle 4 T-3 fix. Trigger wired BEFORE INSERT OR UPDATE OF role, club_id. Blocks (1) non-admin grant of admin/club_admin role, (2) non-admin UPDATE of club_id (cross-club role transfer). Limitation: rejected attempts are NOT captured in audit_log (rollback). Follow-up: dedicated tampering_attempts table.';