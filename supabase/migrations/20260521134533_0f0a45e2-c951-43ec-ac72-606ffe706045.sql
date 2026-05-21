
BEGIN;

-- =========================================================================
-- 1. MASQUAGE COORDONNEES MINEURS ENTRE PAIRS (A2-005)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.viewer_sees_sensitive(_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.is_minor(_profile_id) THEN true
    WHEN _profile_id = auth.uid() THEN true
    WHEN public.is_admin(auth.uid()) THEN true
    WHEN public.is_legal_guardian_of(auth.uid(), _profile_id) THEN true
    WHEN public.is_coach_of_player(auth.uid(), _profile_id) THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = _profile_id AND tm.is_active = true
        AND public.is_club_admin_of_team(auth.uid(), tm.team_id)
    ) THEN true
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.viewer_sees_sensitive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viewer_sees_sensitive(uuid) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.profiles_safe
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.first_name,
  p.nickname,
  p.club_id,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.last_name ELSE NULL END AS last_name,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.email ELSE NULL END AS email,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.photo_url ELSE NULL END AS photo_url,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.birthdate ELSE NULL END AS birthdate,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.photo_is_minor ELSE NULL END AS photo_is_minor,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.image_rights_consent_at ELSE NULL END AS image_rights_consent_at
FROM public.profiles p;
GRANT SELECT ON public.profiles_safe TO authenticated;

-- =========================================================================
-- 2. FILE NOTIFICATIONS PARENTALES (A2-006, A2-009)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.pending_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id uuid NOT NULL,
  minor_profile_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  send_error text,
  attempts int NOT NULL DEFAULT 0
);
ALTER TABLE public.pending_notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS pending_notifications_unsent
  ON public.pending_notifications (created_at) WHERE sent_at IS NULL;

DROP POLICY IF EXISTS "Admin reads pending_notifications" ON public.pending_notifications;
CREATE POLICY "Admin reads pending_notifications" ON public.pending_notifications
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Recipient reads own pending_notifications" ON public.pending_notifications;
CREATE POLICY "Recipient reads own pending_notifications" ON public.pending_notifications
  FOR SELECT TO authenticated USING (recipient_profile_id = auth.uid());
-- INSERT/UPDATE/DELETE : service_role only (pas de policy authenticated).

CREATE OR REPLACE FUNCTION public.enqueue_guardian_notification(
  _minor_id uuid, _event_type text, _payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _minor_id IS NULL OR NOT public.is_minor(_minor_id) THEN RETURN; END IF;
  INSERT INTO public.pending_notifications
    (recipient_profile_id, minor_profile_id, event_type, payload)
  SELECT pc.guardian_profile_id, _minor_id, _event_type, _payload
  FROM public.parental_consents pc
  WHERE pc.minor_profile_id = _minor_id AND pc.revoked_at IS NULL;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_guardian_notification(uuid, text, jsonb) FROM PUBLIC, anon;

-- =========================================================================
-- 3. JOURNAL D'ACCES AUX DONNEES DU MINEUR (A2-006)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.minor_data_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  minor_profile_id uuid NOT NULL,
  actor_id uuid,
  actor_role text,
  access_type text NOT NULL CHECK (access_type IN ('read','write','export')),
  target text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.minor_data_access_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS minor_data_access_log_minor_idx
  ON public.minor_data_access_log (minor_profile_id, occurred_at DESC);

DROP POLICY IF EXISTS "Admin reads minor_data_access_log" ON public.minor_data_access_log;
CREATE POLICY "Admin reads minor_data_access_log" ON public.minor_data_access_log
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Guardian reads child access log" ON public.minor_data_access_log;
CREATE POLICY "Guardian reads child access log" ON public.minor_data_access_log
  FOR SELECT TO authenticated
  USING (public.is_legal_guardian_of(auth.uid(), minor_profile_id));
-- Append-only : aucune policy INSERT/UPDATE/DELETE pour authenticated.

CREATE OR REPLACE FUNCTION public.log_minor_data_write(
  _minor_id uuid, _target text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _minor_id IS NULL OR NOT public.is_minor(_minor_id) THEN RETURN; END IF;
  INSERT INTO public.minor_data_access_log
    (minor_profile_id, actor_id, actor_role, access_type, target)
  VALUES (_minor_id, auth.uid(), auth.role()::text, 'write', _target);
END; $$;

-- RPC dediee pour lecture tracee d'une fiche mineur
CREATE OR REPLACE FUNCTION public.get_minor_record(_minor_id uuid)
RETURNS public.profiles
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result public.profiles;
BEGIN
  -- Verif acces (mirror viewer_sees_sensitive)
  IF NOT public.viewer_sees_sensitive(_minor_id) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO result FROM public.profiles WHERE id = _minor_id;
  IF public.is_minor(_minor_id) THEN
    INSERT INTO public.minor_data_access_log
      (minor_profile_id, actor_id, actor_role, access_type, target)
    VALUES (_minor_id, auth.uid(), auth.role()::text, 'read', 'profile');
  END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.get_minor_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_minor_record(uuid) TO authenticated;

-- =========================================================================
-- 4. TRIGGERS NOTIF+LOG
-- =========================================================================

-- Evaluations
CREATE OR REPLACE FUNCTION public.notify_guardian_on_evaluation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_guardian_notification(
    NEW.player_id,
    'evaluation_' || lower(TG_OP),
    jsonb_build_object('evaluation_id', NEW.id, 'type', NEW.type, 'name', NEW.name));
  PERFORM public.log_minor_data_write(NEW.player_id, 'evaluation');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_guardian_evaluation ON public.evaluations;
CREATE TRIGGER trg_notify_guardian_evaluation
  AFTER INSERT OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.notify_guardian_on_evaluation();

-- Profiles update
CREATE OR REPLACE FUNCTION public.notify_guardian_on_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.id = OLD.id AND public.is_minor(NEW.id) THEN
    PERFORM public.enqueue_guardian_notification(
      NEW.id, 'profile_updated',
      jsonb_build_object(
        'changed_fields',
        (SELECT jsonb_agg(k) FROM (
          SELECT 'first_name' AS k WHERE NEW.first_name IS DISTINCT FROM OLD.first_name
          UNION ALL SELECT 'last_name' WHERE NEW.last_name IS DISTINCT FROM OLD.last_name
          UNION ALL SELECT 'nickname'  WHERE NEW.nickname  IS DISTINCT FROM OLD.nickname
          UNION ALL SELECT 'photo_url' WHERE NEW.photo_url IS DISTINCT FROM OLD.photo_url
          UNION ALL SELECT 'birthdate' WHERE NEW.birthdate IS DISTINCT FROM OLD.birthdate
          UNION ALL SELECT 'club_id'   WHERE NEW.club_id   IS DISTINCT FROM OLD.club_id
        ) s)
      )
    );
    PERFORM public.log_minor_data_write(NEW.id, 'profile');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_guardian_profile ON public.profiles;
CREATE TRIGGER trg_notify_guardian_profile
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_guardian_on_profile_update();

-- Team membership
CREATE OR REPLACE FUNCTION public.notify_guardian_on_team_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_guardian_notification(
    NEW.user_id, 'team_' || lower(TG_OP),
    jsonb_build_object('team_id', NEW.team_id, 'member_type', NEW.member_type, 'is_active', NEW.is_active));
  PERFORM public.log_minor_data_write(NEW.user_id, 'team_membership');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_guardian_team ON public.team_members;
CREATE TRIGGER trg_notify_guardian_team
  AFTER INSERT OR UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_guardian_on_team_change();

-- User roles
CREATE OR REPLACE FUNCTION public.notify_guardian_on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_guardian_notification(
    NEW.user_id, 'role_added',
    jsonb_build_object('role', NEW.role, 'club_id', NEW.club_id));
  PERFORM public.log_minor_data_write(NEW.user_id, 'user_role');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_guardian_role ON public.user_roles;
CREATE TRIGGER trg_notify_guardian_role
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.notify_guardian_on_role_change();

-- Evaluation scores (juste log d'ecriture, pas de notif individuelle pour eviter spam)
CREATE OR REPLACE FUNCTION public.log_minor_eval_score_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_player uuid;
BEGIN
  SELECT player_id INTO v_player FROM public.evaluations WHERE id = NEW.evaluation_id;
  PERFORM public.log_minor_data_write(v_player, 'evaluation_score');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_log_minor_eval_score ON public.evaluation_scores;
CREATE TRIGGER trg_log_minor_eval_score
  AFTER INSERT OR UPDATE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.log_minor_eval_score_write();

-- =========================================================================
-- 5. GARDE-FOU BIENVEILLANCE COMMENTAIRES (A2-013 — liste a enrichir)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.guard_minor_comment_decency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_player uuid;
  v_text text;
  -- Liste minimale a enrichir cote produit (eviter faux positifs type "match nul").
  -- Termes deliberement insultants/discriminatoires uniquement.
  v_blacklist text[] := ARRAY['connard','salope','enculé','pd ','pédé','négro','bougnoul'];
  w text;
BEGIN
  IF TG_TABLE_NAME = 'evaluation_scores' THEN
    SELECT player_id INTO v_player FROM public.evaluations WHERE id = NEW.evaluation_id;
    v_text := NEW.comment;
  ELSE
    v_player := NEW.player_id;
    v_text := NEW.notes;
  END IF;
  IF v_text IS NULL OR NOT public.is_minor(v_player) THEN RETURN NEW; END IF;
  FOREACH w IN ARRAY v_blacklist LOOP
    IF lower(v_text) LIKE '%'||w||'%' THEN
      RAISE EXCEPTION 'COMMENT_REJECTED: Ce commentaire contient un terme inapproprié pour un mineur. Merci de rester factuel et bienveillant (Charte du sport).'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_minor_eval_score_comment ON public.evaluation_scores;
CREATE TRIGGER trg_guard_minor_eval_score_comment
  BEFORE INSERT OR UPDATE ON public.evaluation_scores
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_comment_decency();

DROP TRIGGER IF EXISTS trg_guard_minor_eval_notes ON public.evaluations;
CREATE TRIGGER trg_guard_minor_eval_notes
  BEFORE INSERT OR UPDATE ON public.evaluations
  FOR EACH ROW EXECUTE FUNCTION public.guard_minor_comment_decency();

COMMIT;
