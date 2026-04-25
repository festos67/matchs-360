-- F-205 + F-213 (2026-04-25): Anti-oracle hardening for SECURITY DEFINER RBAC helpers
-- =============================================================================
-- STANDARD pour toute future fonction SECURITY DEFINER acceptant un UUID désignant
-- un utilisateur : ajouter le garde-fou ci-dessous AVANT toute logique métier.
--
-- Principe :
--  - Si le caller sonde son propre UUID (_user_id = auth.uid()) -> autorisé
--  - Si le caller est service_role (triggers, edge functions privilégiées) -> autorisé
--  - Si le caller est super-admin (lookup direct user_roles, pas is_admin pour éviter récursion) -> autorisé
--  - Sinon : RETURN silencieux (false / array vide / NULL) — JAMAIS RAISE
--    pour ne pas créer d'oracle binaire ("uuid invalide" vs "uuid non autorisé").
-- =============================================================================

BEGIN;

-- -------------------- BOOLEAN HELPERS --------------------

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'
  );
END;
$$;
COMMENT ON FUNCTION public.is_admin(uuid) IS
  'F-205 (2026-04-25): silently refuses identity probes by non-privileged callers. Bypass: self / service_role / super-admin.';

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'club_admin' AND club_id = _club_id
  );
END;
$$;
COMMENT ON FUNCTION public.is_club_admin(uuid, uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.is_club_admin_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    FROM public.teams t
    JOIN public.user_roles ur ON ur.club_id = t.club_id
    WHERE t.id = _team_id
      AND ur.user_id = _user_id
      AND ur.role = 'club_admin'
  );
END;
$$;
COMMENT ON FUNCTION public.is_club_admin_of_team(uuid, uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.is_coach_of_player(_coach_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _coach_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.team_members tm_coach
    JOIN public.team_members tm_player
      ON tm_player.team_id = tm_coach.team_id
    WHERE tm_coach.user_id = _coach_id
      AND tm_coach.member_type = 'coach'
      AND tm_coach.is_active = true
      AND tm_player.user_id = _player_id
      AND tm_player.member_type = 'player'
      AND tm_player.is_active = true
  );
END;
$$;
COMMENT ON FUNCTION public.is_coach_of_player(uuid, uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.is_coach_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
      AND member_type = 'coach'
      AND is_active = true
  );
END;
$$;
COMMENT ON FUNCTION public.is_coach_of_team(uuid, uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.is_player_in_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
      AND member_type = 'player'
      AND is_active = true
  );
END;
$$;
COMMENT ON FUNCTION public.is_player_in_team(uuid, uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.is_referent_coach_of_team(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id
      AND team_id = _team_id
      AND member_type = 'coach'
      AND coach_role = 'referent'
      AND is_active = true
  );
END;
$$;
COMMENT ON FUNCTION public.is_referent_coach_of_team(uuid, uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.is_supporter_of_player(_supporter_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _supporter_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.supporters_link
    WHERE supporter_id = _supporter_id AND player_id = _player_id
  );
END;
$$;
COMMENT ON FUNCTION public.is_supporter_of_player(uuid, uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

-- -------------------- SETOF uuid HELPERS --------------------

CREATE OR REPLACE FUNCTION public.get_coach_player_ids(_coach_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _coach_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT tm_player.user_id
    FROM public.team_members tm_coach
    JOIN public.team_members tm_player
      ON tm_player.team_id = tm_coach.team_id
    WHERE tm_coach.user_id = _coach_id
      AND tm_coach.member_type = 'coach'
      AND tm_coach.is_active = true
      AND tm_player.member_type = 'player'
      AND tm_player.is_active = true;
END;
$$;
COMMENT ON FUNCTION public.get_coach_player_ids(uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.get_referent_coach_team_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT team_id
    FROM public.team_members
    WHERE user_id = _user_id
      AND member_type = 'coach'
      AND coach_role = 'referent'
      AND is_active = true;
END;
$$;
COMMENT ON FUNCTION public.get_referent_coach_team_ids(uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.get_supporter_player_team_ids(_supporter_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _supporter_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT tm.team_id
    FROM public.supporters_link sl
    JOIN public.team_members tm ON tm.user_id = sl.player_id
    WHERE sl.supporter_id = _supporter_id
      AND tm.member_type = 'player'
      AND tm.is_active = true;
END;
$$;
COMMENT ON FUNCTION public.get_supporter_player_team_ids(uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.get_teammate_user_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT tm_other.user_id
    FROM public.team_members tm_self
    JOIN public.team_members tm_other ON tm_other.team_id = tm_self.team_id
    WHERE tm_self.user_id = _user_id
      AND tm_self.is_active = true
      AND tm_other.is_active = true
      AND tm_other.user_id <> _user_id;
END;
$$;
COMMENT ON FUNCTION public.get_teammate_user_ids(uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.get_user_club_admin_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT club_id
    FROM public.user_roles
    WHERE user_id = _user_id AND role = 'club_admin' AND club_id IS NOT NULL;
END;
$$;
COMMENT ON FUNCTION public.get_user_club_admin_ids(uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.get_user_club_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT DISTINCT club_id
    FROM public.user_roles
    WHERE user_id = _user_id AND club_id IS NOT NULL;
END;
$$;
COMMENT ON FUNCTION public.get_user_club_ids(uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

CREATE OR REPLACE FUNCTION public.get_user_team_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT team_id
    FROM public.team_members
    WHERE user_id = _user_id AND is_active = true;
END;
$$;
COMMENT ON FUNCTION public.get_user_team_ids(uuid) IS 'F-205 (2026-04-25): anti-oracle hardening.';

-- -------------------- SCALAR uuid HELPER --------------------

CREATE OR REPLACE FUNCTION public.get_player_club_id(_player_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
BEGIN
  IF _player_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     )
     AND NOT EXISTS (
       -- Allow club_admins / coaches / supporters legitimately scoped to this player
       -- via team membership intersection (covers RLS callers that pass arbitrary player UUIDs)
       SELECT 1
       FROM public.team_members tm_self
       JOIN public.team_members tm_player ON tm_player.team_id = tm_self.team_id
       WHERE tm_self.user_id = auth.uid()
         AND tm_self.is_active = true
         AND tm_player.user_id = _player_id
         AND tm_player.is_active = true
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.supporters_link
       WHERE supporter_id = auth.uid() AND player_id = _player_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       JOIN public.user_roles ur ON ur.club_id = p.club_id AND ur.role = 'club_admin'
       WHERE p.id = _player_id AND ur.user_id = auth.uid()
     ) THEN
    RETURN NULL;
  END IF;
  SELECT club_id INTO v_club_id FROM public.profiles WHERE id = _player_id;
  RETURN v_club_id;
END;
$$;
COMMENT ON FUNCTION public.get_player_club_id(uuid) IS
  'F-205 (2026-04-25): silently returns NULL if caller has no legitimate scope (self / service_role / admin / teammate-coach / supporter / club_admin of player).';

-- -------------------- F-213: Storage attachment guard --------------------

CREATE OR REPLACE FUNCTION public.can_write_objective_attachment(_user_id uuid, _path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_objective_id uuid;
  v_team_id uuid;
BEGIN
  -- F-213 (2026-04-25) anti-oracle: refuse silently if caller probes for another user
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;

  -- Path layout: <objective_id>/<filename>
  v_objective_id := NULLIF(split_part(_path, '/', 1), '')::uuid;
  IF v_objective_id IS NULL THEN
    RETURN false;
  END IF;

  -- team_objectives first
  SELECT team_id INTO v_team_id
  FROM public.team_objectives
  WHERE id = v_objective_id;

  IF v_team_id IS NOT NULL THEN
    RETURN public.is_admin(_user_id)
        OR public.is_club_admin_of_team(_user_id, v_team_id)
        OR public.is_referent_coach_of_team(_user_id, v_team_id);
  END IF;

  -- player_objectives fallback
  SELECT team_id INTO v_team_id
  FROM public.player_objectives
  WHERE id = v_objective_id;

  IF v_team_id IS NOT NULL THEN
    RETURN public.is_admin(_user_id)
        OR public.is_club_admin_of_team(_user_id, v_team_id)
        OR public.is_referent_coach_of_team(_user_id, v_team_id);
  END IF;

  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
COMMENT ON FUNCTION public.can_write_objective_attachment(uuid, text) IS
  'F-213 (2026-04-25): silently refuses identity probes by non-privileged callers.';

-- -------------------- GRANTS (idempotent) --------------------

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_club_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_club_admin_of_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_coach_of_player(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_coach_of_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_player_in_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_referent_coach_of_team(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_supporter_of_player(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_coach_player_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_referent_coach_team_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_supporter_player_team_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teammate_user_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_club_admin_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_club_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_team_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_player_club_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_objective_attachment(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_club_admin_of_team(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_coach_of_player(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_coach_of_team(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_player_in_team(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_referent_coach_of_team(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_supporter_of_player(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_player_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_referent_coach_team_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_supporter_player_team_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teammate_user_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_club_admin_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_club_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_team_ids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_player_club_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_write_objective_attachment(uuid, text) TO authenticated, service_role;

COMMIT;