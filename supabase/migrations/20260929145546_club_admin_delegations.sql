-- =====================================================================
-- Délégation temporaire des droits du responsable de club.
--
-- Pendant une absence (maladie, congés), un responsable de club TITULAIRE
-- confie ses droits, pour une période datée, à un membre ADULTE du club
-- (coach ou joueur de 18 ans et plus) — jamais à un mineur ni à un simple
-- supporter.
--
-- Mécanisme : pendant la période, le délégué reçoit une ligne user_roles
-- 'club_admin' rattachée à la délégation (delegation_id). Toute
-- l'application (règles d'accès, fonctions serveur, interface) le reconnaît
-- donc sans autre changement. La ligne est créée / supprimée par
-- sync_club_admin_delegations() (tâche planifiée toutes les 10 minutes et
-- appel immédiat à la création / au retrait) ; is_club_admin() ignore déjà
-- une délégation échue, sans attendre la tâche.
--
-- Garde-fous :
--  - seul un responsable titulaire (ou un administrateur) délègue ;
--  - un délégué ne peut ni déléguer, ni nommer ou retirer un responsable
--    (guard_delegated_club_admin + contrôles dans admin-users / send-invitation) ;
--  - 3 mois au plus ; retrait à tout moment par le titulaire, un
--    administrateur ou le délégué lui-même ;
--  - notifications au délégué et au titulaire, trace dans audit_log.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.club_admin_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  delegator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  delegate_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  end_notified_at timestamptz,
  CONSTRAINT club_admin_delegations_period CHECK (ends_at > starts_at),
  CONSTRAINT club_admin_delegations_reason_len CHECK (reason IS NULL OR length(reason) <= 200)
);

CREATE INDEX IF NOT EXISTS club_admin_delegations_club_idx
  ON public.club_admin_delegations (club_id, ends_at);
CREATE INDEX IF NOT EXISTS club_admin_delegations_delegate_idx
  ON public.club_admin_delegations (delegate_id, ends_at);

ALTER TABLE public.club_admin_delegations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.club_admin_delegations FROM anon, authenticated;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS delegation_id uuid
  REFERENCES public.club_admin_delegations(id) ON DELETE CASCADE;

-- Délégation valable à l'instant présent.
CREATE OR REPLACE FUNCTION public.club_admin_delegation_is_active(_delegation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_admin_delegations d
    WHERE d.id = _delegation_id
      AND d.revoked_at IS NULL
      AND now() >= d.starts_at
      AND now() < d.ends_at
  );
$$;

REVOKE ALL ON FUNCTION public.club_admin_delegation_is_active(uuid) FROM public, anon, authenticated;

-- is_club_admin / get_user_club_admin_ids : une ligne déléguée ne compte que
-- pendant la période (effet immédiat à l'échéance ou au retrait).
CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND (delegation_id IS NULL OR public.club_admin_delegation_is_active(delegation_id))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_club_admin_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    WHERE user_id = _user_id AND role = 'club_admin' AND club_id IS NOT NULL
      AND (delegation_id IS NULL OR public.club_admin_delegation_is_active(delegation_id));
END;
$function$;

-- Responsable TITULAIRE (hors délégation) d'un club.
CREATE OR REPLACE FUNCTION public.is_titular_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'club_admin' AND club_id = _club_id
      AND delegation_id IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_titular_club_admin(uuid, uuid) FROM public, anon, authenticated;

-- Garde des rôles : autorise la ligne 'club_admin' d'une délégation active,
-- et seulement celle-là, hors administrateur / service_role.
CREATE OR REPLACE FUNCTION public.guard_privileged_role_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Délégation : ligne 'club_admin' rattachée à une délégation valable, pour
  -- le bon délégué et le bon club (créée par sync_club_admin_delegations).
  IF TG_OP = 'INSERT'
     AND NEW.role = 'club_admin'
     AND NEW.delegation_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.club_admin_delegations d
       WHERE d.id = NEW.delegation_id
         AND d.delegate_id = NEW.user_id
         AND d.club_id = NEW.club_id
         AND d.revoked_at IS NULL
         AND now() >= d.starts_at
         AND now() < d.ends_at
     ) THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role))
     AND NEW.role IN ('admin', 'club_admin') THEN
    RAISE EXCEPTION 'Privileged role assignment forbidden: only existing admins or service_role can grant role %', NEW.role
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.club_id IS DISTINCT FROM OLD.club_id THEN
    RAISE EXCEPTION 'Cannot modify club_id on user_roles without admin/service_role authority. Cross-club role transfers must go through a dedicated RPC (not yet implemented).'
      USING ERRCODE = '42501';
  END IF;

  -- Un délégué ne rétrograde pas un responsable (UPDATE de role).
  IF TG_OP = 'UPDATE' AND OLD.role = 'club_admin' AND NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_titular_club_admin(auth.uid(), OLD.club_id) THEN
    RAISE EXCEPTION 'CLUB_ADMIN_REMOVAL_FORBIDDEN: seul un responsable titulaire ou un administrateur peut retirer ce rôle'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.delegation_id IS DISTINCT FROM OLD.delegation_id THEN
    RAISE EXCEPTION 'Cannot modify delegation_id on user_roles'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_privileged_role_grant ON public.user_roles;
CREATE TRIGGER trg_guard_privileged_role_grant
  BEFORE INSERT OR UPDATE OF role, club_id, delegation_id ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_role_grant();

-- Un délégué (responsable par délégation seulement) ne retire pas un rôle
-- de responsable de club.
CREATE OR REPLACE FUNCTION public.guard_delegated_club_admin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Fin de délégation (retrait ou échéance) : la ligne déléguée part.
  IF OLD.delegation_id IS NOT NULL
     AND NOT public.club_admin_delegation_is_active(OLD.delegation_id) THEN
    RETURN OLD;
  END IF;
  IF OLD.role = 'club_admin'
     AND auth.uid() IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_titular_club_admin(auth.uid(), OLD.club_id) THEN
    RAISE EXCEPTION 'CLUB_ADMIN_REMOVAL_FORBIDDEN: seul un responsable titulaire ou un administrateur peut retirer ce rôle'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_delegated_club_admin_delete ON public.user_roles;
CREATE TRIGGER trg_guard_delegated_club_admin_delete
  BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_delegated_club_admin_delete();

REVOKE ALL ON FUNCTION public.guard_delegated_club_admin_delete() FROM public, anon, authenticated;

-- Synchronisation des lignes de rôle avec les délégations.
CREATE OR REPLACE FUNCTION public.sync_club_admin_delegations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d record;
BEGIN
  -- Délégations en cours : créer la ligne de rôle manquante.
  INSERT INTO public.user_roles (user_id, role, club_id, delegation_id)
  SELECT d2.delegate_id, 'club_admin', d2.club_id, d2.id
  FROM public.club_admin_delegations d2
  WHERE d2.revoked_at IS NULL
    AND now() >= d2.starts_at
    AND now() < d2.ends_at
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = d2.delegate_id AND ur.role = 'club_admin' AND ur.club_id = d2.club_id
    )
  ON CONFLICT (user_id, role, club_id) DO NOTHING;

  -- Délégations échues ou retirées : supprimer la ligne de rôle.
  DELETE FROM public.user_roles ur
  USING public.club_admin_delegations d3
  WHERE ur.delegation_id = d3.id
    AND (d3.revoked_at IS NOT NULL OR now() >= d3.ends_at);

  -- Fin de délégation : prévenir le délégué et le titulaire (une fois).
  FOR d IN
    SELECT d4.* FROM public.club_admin_delegations d4
    WHERE d4.end_notified_at IS NULL
      AND (d4.revoked_at IS NOT NULL OR now() >= d4.ends_at)
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT uid, 'Délégation terminée',
      'La délégation des droits de responsable de club a pris fin.',
      'info', '/club/users'
    FROM unnest(ARRAY[d.delegate_id, d.delegator_id]) AS uid
    WHERE uid IS NOT NULL;
    UPDATE public.club_admin_delegations SET end_notified_at = now() WHERE id = d.id;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_club_admin_delegations() FROM public, anon, authenticated;

-- Création d'une délégation.
CREATE OR REPLACE FUNCTION public.create_club_admin_delegation(
  _club_id uuid,
  _delegate_id uuid,
  _starts_at timestamptz,
  _ends_at timestamptz,
  _reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_birthdate date;
  v_is_coach boolean;
  v_is_player boolean;
  v_id uuid;
  v_start timestamptz := GREATEST(_starts_at, now());
  v_delegator_name text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_admin(v_caller) OR public.is_titular_club_admin(v_caller, _club_id)) THEN
    RAISE EXCEPTION 'DELEGATION_TITULAR_ONLY' USING ERRCODE = '42501';
  END IF;
  IF _delegate_id IS NULL OR _delegate_id = v_caller THEN
    RAISE EXCEPTION 'DELEGATION_INVALID_DELEGATE' USING ERRCODE = '22023';
  END IF;
  IF _starts_at IS NULL OR _ends_at IS NULL OR _ends_at <= v_start THEN
    RAISE EXCEPTION 'DELEGATION_INVALID_PERIOD' USING ERRCODE = '22023';
  END IF;
  IF _starts_at < now() - INTERVAL '1 day' OR _ends_at - v_start > INTERVAL '92 days' THEN
    RAISE EXCEPTION 'DELEGATION_INVALID_PERIOD' USING ERRCODE = '22023';
  END IF;

  SELECT p.birthdate INTO v_birthdate
  FROM public.profiles p WHERE p.id = _delegate_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELEGATION_INVALID_DELEGATE' USING ERRCODE = '22023';
  END IF;

  -- Jamais un mineur.
  IF v_birthdate IS NOT NULL AND v_birthdate > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'DELEGATION_MINOR_FORBIDDEN' USING ERRCODE = '22023';
  END IF;

  -- Membre du club : coach ou joueur actif d'une équipe du club.
  SELECT
    EXISTS (SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
            WHERE tm.user_id = _delegate_id AND tm.member_type = 'coach' AND tm.is_active
              AND tm.deleted_at IS NULL AND t.club_id = _club_id AND t.deleted_at IS NULL),
    EXISTS (SELECT 1 FROM public.team_members tm JOIN public.teams t ON t.id = tm.team_id
            WHERE tm.user_id = _delegate_id AND tm.member_type = 'player' AND tm.is_active
              AND tm.deleted_at IS NULL AND t.club_id = _club_id AND t.deleted_at IS NULL)
  INTO v_is_coach, v_is_player;

  IF NOT v_is_coach AND NOT v_is_player THEN
    RAISE EXCEPTION 'DELEGATION_NOT_CLUB_MEMBER' USING ERRCODE = '22023';
  END IF;
  -- Joueur sans date de naissance : âge invérifiable, refus.
  IF NOT v_is_coach AND v_birthdate IS NULL THEN
    RAISE EXCEPTION 'DELEGATION_AGE_UNKNOWN' USING ERRCODE = '22023';
  END IF;

  IF public.is_titular_club_admin(_delegate_id, _club_id) THEN
    RAISE EXCEPTION 'DELEGATION_ALREADY_CLUB_ADMIN' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.club_admin_delegations d
    WHERE d.club_id = _club_id AND d.delegate_id = _delegate_id
      AND d.revoked_at IS NULL AND d.ends_at > now()
  ) THEN
    RAISE EXCEPTION 'DELEGATION_ALREADY_EXISTS' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.club_admin_delegations (club_id, delegator_id, delegate_id, starts_at, ends_at, reason)
  VALUES (_club_id, v_caller, _delegate_id, v_start, _ends_at, NULLIF(trim(_reason), ''))
  RETURNING id INTO v_id;

  PERFORM public.sync_club_admin_delegations();

  SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), 'Le responsable du club')
    INTO v_delegator_name FROM public.profiles WHERE id = v_caller;

  INSERT INTO public.notifications (user_id, title, message, type, link)
  VALUES (
    _delegate_id,
    'Délégation des droits de responsable',
    v_delegator_name || ' vous confie ses droits de responsable de club du '
      || to_char(v_start AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY') || ' au '
      || to_char(_ends_at AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY')
      || '. Choisissez le profil « Responsable Club » pour les utiliser.',
    'info',
    '/club/users'
  );

  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, after_data)
  VALUES (v_caller, 'club_admin', 'club_admin_delegation_created', 'club_admin_delegations', v_id::text,
          jsonb_build_object('club_id', _club_id, 'delegate_id', _delegate_id,
                             'starts_at', v_start, 'ends_at', _ends_at));
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_club_admin_delegation(uuid, uuid, timestamptz, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_club_admin_delegation(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;

-- Retrait (titulaire, administrateur ou délégué lui-même).
CREATE OR REPLACE FUNCTION public.revoke_club_admin_delegation(_delegation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  d record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO d FROM public.club_admin_delegations WHERE id = _delegation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELEGATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_admin(v_caller)
          OR public.is_titular_club_admin(v_caller, d.club_id)
          OR d.delegate_id = v_caller) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF d.revoked_at IS NOT NULL OR d.ends_at <= now() THEN
    RETURN;
  END IF;

  UPDATE public.club_admin_delegations
     SET revoked_at = now(), revoked_by = v_caller
   WHERE id = _delegation_id;

  PERFORM public.sync_club_admin_delegations();

  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, after_data)
  VALUES (v_caller, CASE WHEN d.delegate_id = v_caller THEN 'delegate' ELSE 'club_admin' END,
          'club_admin_delegation_revoked', 'club_admin_delegations', _delegation_id::text,
          jsonb_build_object('club_id', d.club_id, 'delegate_id', d.delegate_id));
END;
$function$;

REVOKE ALL ON FUNCTION public.revoke_club_admin_delegation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_club_admin_delegation(uuid) TO authenticated;

-- Consultation : délégations du club (responsables, administrateurs) ou
-- celles dont l'appelant est le délégué.
CREATE OR REPLACE FUNCTION public.get_club_admin_delegations(_club_id uuid)
RETURNS TABLE (
  id uuid,
  delegate_id uuid,
  delegate_name text,
  delegator_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  reason text,
  revoked_at timestamptz,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    d.id,
    d.delegate_id,
    COALESCE(NULLIF(trim(concat_ws(' ', pd.first_name, pd.last_name)), ''), pd.email),
    COALESCE(NULLIF(trim(concat_ws(' ', po.first_name, po.last_name)), ''), po.email),
    d.starts_at,
    d.ends_at,
    d.reason,
    d.revoked_at,
    CASE
      WHEN d.revoked_at IS NOT NULL THEN 'revoked'
      WHEN now() >= d.ends_at THEN 'ended'
      WHEN now() < d.starts_at THEN 'planned'
      ELSE 'active'
    END
  FROM public.club_admin_delegations d
  JOIN public.profiles pd ON pd.id = d.delegate_id
  LEFT JOIN public.profiles po ON po.id = d.delegator_id
  WHERE d.club_id = _club_id
    AND auth.uid() IS NOT NULL
    AND (public.is_admin(auth.uid())
         OR public.is_titular_club_admin(auth.uid(), _club_id)
         OR d.delegate_id = auth.uid())
  ORDER BY d.starts_at DESC
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.get_club_admin_delegations(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_club_admin_delegations(uuid) TO authenticated;

-- Titulaire ou délégué, pour l'interface.
CREATE OR REPLACE FUNCTION public.get_my_club_admin_kind(_club_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'none'
    WHEN public.is_titular_club_admin(auth.uid(), _club_id) THEN 'titular'
    WHEN public.is_club_admin(auth.uid(), _club_id) THEN 'delegate'
    ELSE 'none'
  END;
$$;

REVOKE ALL ON FUNCTION public.get_my_club_admin_kind(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_club_admin_kind(uuid) TO authenticated;

-- Tâche planifiée : début / fin des délégations.
SELECT cron.unschedule('club-admin-delegations-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'club-admin-delegations-sync');
SELECT cron.schedule('club-admin-delegations-sync', '*/10 * * * *', 'SELECT public.sync_club_admin_delegations();');
