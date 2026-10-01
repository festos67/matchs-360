-- =====================================================================
-- Supporters : accord de la personne avant tout accès au joueur.
--
-- Jusqu'ici, rattacher un supporter à un joueur lui ouvrait immédiatement
-- l'accès aux débriefs. Désormais chaque lien supporters_link a un statut :
--   pending  : invitation envoyée, en attente de son accord ;
--   accepted : la personne a cliqué « J'accepte » — accès ouvert ;
--   declined : la personne a refusé — aucun accès.
-- Les liens existants passent « accepted » (aucun accès retiré). Le lien du
-- représentant légal (créé au consentement parental) est accepté d'office.
--
-- Seule la personne invitée peut changer le statut (respond_supporter_invitation) ;
-- le staff voit le statut et peut retirer le lien.
-- =====================================================================

ALTER TABLE public.supporters_link
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_email_sent_at timestamptz;

ALTER TABLE public.supporters_link DROP CONSTRAINT IF EXISTS supporters_link_status_check;
ALTER TABLE public.supporters_link
  ADD CONSTRAINT supporters_link_status_check CHECK (status IN ('pending', 'accepted', 'declined'));

-- Liens existants : déjà actifs, on ne coupe aucun accès.
UPDATE public.supporters_link SET status = 'accepted', responded_at = created_at
WHERE status = 'pending';

-- Création : statut imposé (en attente), sauf représentant légal ou service.
CREATE OR REPLACE FUNCTION public.supporters_link_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.invited_by := COALESCE(NEW.invited_by, auth.uid());
  IF NEW.is_legal_guardian THEN
    -- Le consentement parental vaut accord.
    NEW.status := 'accepted';
    NEW.responded_at := COALESCE(NEW.responded_at, now());
  ELSIF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.status := 'pending';
    NEW.responded_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_supporters_link_before_insert ON public.supporters_link;
CREATE TRIGGER trg_supporters_link_before_insert
  BEFORE INSERT ON public.supporters_link
  FOR EACH ROW EXECUTE FUNCTION public.supporters_link_before_insert();

-- Modification du statut : la personne invitée (ou le service) seulement.
CREATE OR REPLACE FUNCTION public.guard_supporters_link_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_legal_guardian AND NOT OLD.is_legal_guardian THEN
    NEW.status := 'accepted';
    NEW.responded_at := COALESCE(NEW.responded_at, now());
    RETURN NEW;
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.responded_at IS DISTINCT FROM OLD.responded_at)
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM OLD.supporter_id THEN
    RAISE EXCEPTION 'SUPPORTER_STATUS_FORBIDDEN: seule la personne invitée peut accepter ou refuser'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_supporters_link_status ON public.supporters_link;
CREATE TRIGGER trg_guard_supporters_link_status
  BEFORE UPDATE ON public.supporters_link
  FOR EACH ROW EXECUTE FUNCTION public.guard_supporters_link_status();

-- Notification dans l'application à la personne invitée.
CREATE OR REPLACE FUNCTION public.supporters_link_notify_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player text;
  v_inviter text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;
  SELECT NULLIF(trim(concat_ws(' ', first_name, last_name)), '') INTO v_player
  FROM public.profiles WHERE id = NEW.player_id;
  SELECT NULLIF(trim(concat_ws(' ', first_name, last_name)), '') INTO v_inviter
  FROM public.profiles WHERE id = NEW.invited_by;
  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      NEW.supporter_id,
      'Invitation à devenir supporter',
      COALESCE(v_inviter, 'Le club') || ' vous invite à suivre ' || COALESCE(v_player, 'un joueur')
        || ' comme supporter. Confirmez votre participation.',
      'info',
      '/supporter/invitations'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'supporters_link_notify_invitation: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_supporters_link_notify_invitation ON public.supporters_link;
CREATE TRIGGER trg_supporters_link_notify_invitation
  AFTER INSERT OR UPDATE OF status ON public.supporters_link
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.supporters_link_notify_invitation();

REVOKE ALL ON FUNCTION public.supporters_link_before_insert() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_supporters_link_status() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.supporters_link_notify_invitation() FROM public, anon, authenticated;

-- Accès aux données du joueur : lien ACCEPTÉ seulement.
CREATE OR REPLACE FUNCTION public.is_supporter_of_player(_supporter_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND status = 'accepted'
  )
  AND NOT public.minor_consent_pending(_player_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_supporter_player_team_ids(_supporter_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND sl.status = 'accepted'
      AND tm.member_type = 'player'
      AND tm.is_active = true;
END;
$function$;

DROP POLICY IF EXISTS "Supporters view team_members of linked players" ON public.team_members;
CREATE POLICY "Supporters view team_members of linked players"
ON public.team_members FOR SELECT
USING (
  is_active = true AND deleted_at IS NULL
  AND user_id IN (
    SELECT sl.player_id FROM public.supporters_link sl
    WHERE sl.supporter_id = auth.uid() AND sl.status = 'accepted'
  )
);

DROP POLICY IF EXISTS "Coaches can create supporter evaluation requests" ON public.supporter_evaluation_requests;
CREATE POLICY "Coaches can create supporter evaluation requests"
ON public.supporter_evaluation_requests FOR INSERT
WITH CHECK (
  requested_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.team_members tm1
    JOIN public.team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.user_id = auth.uid() AND tm1.member_type = 'coach' AND tm1.is_active = true
      AND tm2.user_id = supporter_evaluation_requests.player_id
      AND tm2.member_type = 'player' AND tm2.is_active = true
  )
  AND EXISTS (
    SELECT 1 FROM public.supporters_link sl
    WHERE sl.supporter_id = supporter_evaluation_requests.supporter_id
      AND sl.player_id = supporter_evaluation_requests.player_id
      AND sl.status = 'accepted'
  )
);

-- Invitations en attente de la personne connectée (joueur, club, auteur).
CREATE OR REPLACE FUNCTION public.get_my_supporter_invitations()
RETURNS TABLE (
  id uuid,
  player_name text,
  club_name text,
  team_name text,
  invited_by_name text,
  invited_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sl.id,
    COALESCE(NULLIF(trim(concat_ws(' ', pp.first_name, pp.last_name)), ''), 'Joueur'),
    c.name,
    t.name,
    NULLIF(trim(concat_ws(' ', pi.first_name, pi.last_name)), ''),
    sl.created_at
  FROM public.supporters_link sl
  JOIN public.profiles pp ON pp.id = sl.player_id
  LEFT JOIN public.profiles pi ON pi.id = sl.invited_by
  LEFT JOIN LATERAL (
    SELECT tm.team_id FROM public.team_members tm
    WHERE tm.user_id = sl.player_id AND tm.member_type = 'player'
      AND tm.is_active AND tm.deleted_at IS NULL
    ORDER BY tm.joined_at DESC LIMIT 1
  ) m ON true
  LEFT JOIN public.teams t ON t.id = m.team_id
  LEFT JOIN public.clubs c ON c.id = t.club_id
  WHERE sl.supporter_id = auth.uid()
    AND sl.status = 'pending'
  ORDER BY sl.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_supporter_invitations() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_supporter_invitations() TO authenticated;

-- Réponse de la personne invitée.
CREATE OR REPLACE FUNCTION public.respond_supporter_invitation(_link_id uuid, _accept boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.supporters_link%ROWTYPE;
  v_status text := CASE WHEN _accept THEN 'accepted' ELSE 'declined' END;
  v_supporter text;
  v_player text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_link FROM public.supporters_link WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND OR v_link.supporter_id <> auth.uid() THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_link.status <> 'pending' THEN
    RETURN v_link.status;
  END IF;

  UPDATE public.supporters_link
     SET status = v_status, responded_at = now()
   WHERE id = _link_id;

  -- Prévenir la personne qui a envoyé l'invitation.
  IF v_link.invited_by IS NOT NULL AND v_link.invited_by <> auth.uid() THEN
    SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), email) INTO v_supporter
    FROM public.profiles WHERE id = auth.uid();
    SELECT COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), 'le joueur') INTO v_player
    FROM public.profiles WHERE id = v_link.player_id;
    BEGIN
      INSERT INTO public.notifications (user_id, title, message, type, link)
      VALUES (
        v_link.invited_by,
        CASE WHEN _accept THEN 'Supporter confirmé' ELSE 'Invitation de supporter refusée' END,
        COALESCE(v_supporter, 'La personne invitée')
          || CASE WHEN _accept THEN ' a accepté de suivre ' ELSE ' a refusé de suivre ' END
          || v_player || '.',
        CASE WHEN _accept THEN 'success' ELSE 'info' END,
        '/players/' || v_link.player_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'respond_supporter_invitation notification: %', SQLERRM;
    END;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, after_data)
  VALUES (auth.uid(), 'supporter', 'supporter_invitation_' || v_status, 'supporters_link', _link_id::text,
          jsonb_build_object('player_id', v_link.player_id));

  RETURN v_status;
END;
$function$;

REVOKE ALL ON FUNCTION public.respond_supporter_invitation(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.respond_supporter_invitation(uuid, boolean) TO authenticated;
